//! What the main process calls: the display copy's write (crate::display).

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;
use std::ptr;

use napi::bindgen_prelude::{AsyncTask, Unknown};
use napi::{Env, Error, JsValue, Result, Status, Task, sys};
use napi_derive::napi;

use crate::display::{JsonText, write_atomically};

/// Writes `copy` to `file` as the text `JSON.stringify(copy)` gives. The value is read here, on the calling thread, as
/// it stands now; the file is written on the thread pool, and the promise settles once it is replaced, or rejects with
/// why it was not.
#[napi(catch_unwind)]
pub fn write_display_copy(env: Env, file: String, copy: Unknown<'_>) -> Result<AsyncTask<WriteDisplayCopy>> {
    let mut text = JsonText::new();
    // SAFETY: `copy` is a value of this call's environment, read on its thread before the call returns
    unsafe { Reader { env: env.raw(), units: Vec::new() }.value(copy.value().value, &mut text, 0)? };
    Ok(AsyncTask::new(WriteDisplayCopy { file: PathBuf::from(file), text: text.into_bytes() }))
}

pub struct WriteDisplayCopy {
    file: PathBuf,
    text: Vec<u8>,
}

impl Task for WriteDisplayCopy {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<()> {
        // A panic on the thread pool would end the application: it fails the write instead
        match catch_unwind(AssertUnwindSafe(|| write_atomically(&self.file, &self.text))) {
            Ok(written) => written.map_err(|e| Error::new(Status::GenericFailure, e.to_string())),
            Err(_) => Err(Error::new(Status::GenericFailure, format!("writing the display copy to {} panicked", self.file.display()))),
        }
    }

    fn resolve(&mut self, _env: Env, _output: ()) -> Result<()> {
        Ok(())
    }
}

/// How deep a value may nest: far deeper than any display copy, so that a cycle fails the write, as `JSON.stringify`
/// throws on one, rather than overflowing the stack
const DEPTH: u32 = 1000;

/// Reads a JavaScript value into JSON text the way `JSON.stringify` does, for what JSON holds — objects, arrays,
/// strings, numbers, booleans and null. An object member that is `undefined`, a function or a symbol is left out, and
/// such an array element is `null`; an object's members are its own enumerable string keys, in the engine's order.
/// A BigInt or a cycle fails, as they make `JSON.stringify` throw. A `toJSON` method is not called: none is in what
/// the display copy holds (src/shared/display-data.ts).
struct Reader {
    env: sys::napi_env,
    /// One buffer for every string read
    units: Vec<u16>,
}

impl Reader {
    unsafe fn value(&mut self, value: sys::napi_value, out: &mut JsonText, depth: u32) -> Result<()> {
        let kind = unsafe { self.type_of(value)? };
        unsafe { self.typed(value, kind, out, depth) }
    }

    unsafe fn typed(&mut self, value: sys::napi_value, kind: sys::napi_valuetype, out: &mut JsonText, depth: u32) -> Result<()> {
        match kind {
            sys::ValueType::napi_null => out.null(),
            sys::ValueType::napi_boolean => {
                let mut b = false;
                check(unsafe { sys::napi_get_value_bool(self.env, value, &mut b) })?;
                out.bool(b);
            }
            sys::ValueType::napi_number => {
                let mut n = 0.0;
                check(unsafe { sys::napi_get_value_double(self.env, value, &mut n) })?;
                out.number(n);
            }
            sys::ValueType::napi_string => {
                unsafe { self.read_string(value)? };
                out.string(&self.units);
            }
            sys::ValueType::napi_object => {
                if depth >= DEPTH {
                    return Err(Error::new(Status::InvalidArg, format!("the display copy nests deeper than {DEPTH} levels, as a cycle would")));
                }
                // Each container's handles are let go once it is read, so a large copy holds only one path's worth
                let mut scope = ptr::null_mut();
                check(unsafe { sys::napi_open_handle_scope(self.env, &mut scope) })?;
                let read = unsafe { self.container(value, out, depth) };
                check(unsafe { sys::napi_close_handle_scope(self.env, scope) })?;
                read?;
            }
            sys::ValueType::napi_bigint => return Err(Error::new(Status::BigintExpected, "the display copy holds a BigInt, which JSON cannot")),
            other => return Err(Error::new(Status::InvalidArg, format!("the display copy holds a value JSON cannot (N-API type {other})"))),
        }
        Ok(())
    }

    unsafe fn container(&mut self, value: sys::napi_value, out: &mut JsonText, depth: u32) -> Result<()> {
        let mut is_array = false;
        check(unsafe { sys::napi_is_array(self.env, value, &mut is_array) })?;
        if is_array {
            out.begin_array();
            for i in 0..unsafe { self.length(value)? } {
                let mut element = ptr::null_mut();
                check(unsafe { sys::napi_get_element(self.env, value, i, &mut element) })?;
                let kind = unsafe { self.type_of(element)? };
                if skipped(kind) {
                    out.null();
                } else {
                    unsafe { self.typed(element, kind, out, depth + 1)? };
                }
            }
            out.end_array();
            return Ok(());
        }
        let mut keys = ptr::null_mut();
        check(unsafe {
            sys::napi_get_all_property_names(
                self.env,
                value,
                sys::KeyCollectionMode::own_only,
                sys::KeyFilter::enumerable | sys::KeyFilter::skip_symbols,
                sys::KeyConversion::numbers_to_strings,
                &mut keys,
            )
        })?;
        out.begin_object();
        for i in 0..unsafe { self.length(keys)? } {
            let mut key = ptr::null_mut();
            check(unsafe { sys::napi_get_element(self.env, keys, i, &mut key) })?;
            let mut member = ptr::null_mut();
            check(unsafe { sys::napi_get_property(self.env, value, key, &mut member) })?;
            let kind = unsafe { self.type_of(member)? };
            if skipped(kind) {
                continue;
            }
            unsafe { self.read_string(key)? };
            out.key(&self.units);
            unsafe { self.typed(member, kind, out, depth + 1)? };
        }
        out.end_object();
        Ok(())
    }

    unsafe fn type_of(&self, value: sys::napi_value) -> Result<sys::napi_valuetype> {
        let mut kind = 0;
        check(unsafe { sys::napi_typeof(self.env, value, &mut kind) })?;
        Ok(kind)
    }

    unsafe fn length(&self, array: sys::napi_value) -> Result<u32> {
        let mut length = 0;
        check(unsafe { sys::napi_get_array_length(self.env, array, &mut length) })?;
        Ok(length)
    }

    /// The string's UTF-16 code units, lone surrogates included, into `self.units`: in one call when it fits the buffer,
    /// as nearly every string does, and otherwise in a second once its length is known
    unsafe fn read_string(&mut self, value: sys::napi_value) -> Result<()> {
        self.units.clear();
        // The room past the units is for the terminator N-API writes
        self.units.reserve(4096);
        let mut room = self.units.capacity();
        let mut copied = 0;
        check(unsafe { sys::napi_get_value_string_utf16(self.env, value, self.units.as_mut_ptr(), room, &mut copied) })?;
        if copied + 1 == room {
            let mut length = 0;
            check(unsafe { sys::napi_get_value_string_utf16(self.env, value, ptr::null_mut(), 0, &mut length) })?;
            self.units.reserve(length + 1);
            room = self.units.capacity();
            check(unsafe { sys::napi_get_value_string_utf16(self.env, value, self.units.as_mut_ptr(), room, &mut copied) })?;
        }
        // SAFETY: N-API wrote `copied` units into the reserved capacity, which is at least `copied + 1`
        unsafe { self.units.set_len(copied) };
        Ok(())
    }
}

/// What `JSON.stringify` leaves out of an object, and writes as `null` in an array
fn skipped(kind: sys::napi_valuetype) -> bool {
    matches!(kind, sys::ValueType::napi_undefined | sys::ValueType::napi_function | sys::ValueType::napi_symbol)
}

fn check(status: sys::napi_status) -> Result<()> {
    if status == sys::Status::napi_ok {
        Ok(())
    } else {
        Err(Error::new(Status::from(status), "reading the display copy's value failed"))
    }
}
