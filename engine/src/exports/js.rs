//! The conversions between JavaScript's values and the module's, for the exports, for each side's adapter, which alone
//! knows its job's and its entry's shape, and for the display copy's writer, which reads a whole value as
//! `JSON.stringify` does (crate::display). Every value the module reads off JavaScript is read here, but for the
//! arguments napi-rs converts at the call. Text crosses as UTF-16 code units both ways, so a lone surrogate in a string
//! comes back as it went in; a value the module only hands back crosses as the JavaScript value itself.

use std::ffi::CString;
use std::ptr;

use napi::sys::{self, napi_value};
use napi::{Env, Error, Result, Status};

use crate::question::Record;
use crate::text::Units;

fn check(status: sys::napi_status) -> Result<()> {
    if status == sys::Status::napi_ok { Ok(()) } else { Err(Error::from_status(Status::from(status))) }
}

/// A value's type, as Node-API tells them apart: `typeof`'s, with null its own and an array an object
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    Undefined,
    Null,
    Boolean,
    Number,
    String,
    Symbol,
    Object,
    Function,
    External,
    BigInt,
}

/// The JavaScript side of one call into the module
pub(crate) struct Js {
    env: sys::napi_env,
}

impl Js {
    pub(crate) fn new(env: &Env) -> Self {
        Js { env: env.raw() }
    }

    fn type_of(&self, v: napi_value) -> Result<sys::napi_valuetype> {
        let mut t = 0;
        check(unsafe { sys::napi_typeof(self.env, v, &mut t) })?;
        Ok(t)
    }

    /// The value's type
    pub(crate) fn kind(&self, v: napi_value) -> Result<Kind> {
        Ok(match self.type_of(v)? {
            sys::ValueType::napi_undefined => Kind::Undefined,
            sys::ValueType::napi_null => Kind::Null,
            sys::ValueType::napi_boolean => Kind::Boolean,
            sys::ValueType::napi_number => Kind::Number,
            sys::ValueType::napi_string => Kind::String,
            sys::ValueType::napi_symbol => Kind::Symbol,
            sys::ValueType::napi_object => Kind::Object,
            sys::ValueType::napi_function => Kind::Function,
            sys::ValueType::napi_external => Kind::External,
            sys::ValueType::napi_bigint => Kind::BigInt,
            other => return Err(Error::new(Status::InvalidArg, format!("a value of a type Node-API added after the module was written ({other})"))),
        })
    }

    /// `object[key]`, for an object or a function; undefined for any other value, whose property a rule never reads
    pub(crate) fn get(&self, object: napi_value, key: &str) -> Result<napi_value> {
        let t = self.type_of(object)?;
        if t != sys::ValueType::napi_object && t != sys::ValueType::napi_function {
            return self.undefined();
        }
        let name = CString::new(key).map_err(|e| Error::from_reason(e.to_string()))?;
        let mut v = ptr::null_mut();
        check(unsafe { sys::napi_get_named_property(self.env, object, name.as_ptr(), &mut v) })?;
        Ok(v)
    }

    /// Whether the value is null or undefined (`v ?? x` takes x)
    pub(crate) fn nullish(&self, v: napi_value) -> Result<bool> {
        let t = self.type_of(v)?;
        Ok(t == sys::ValueType::napi_undefined || t == sys::ValueType::napi_null)
    }

    /// The value's truthiness (`!!v`)
    pub(crate) fn truthy(&self, v: napi_value) -> Result<bool> {
        let mut b = ptr::null_mut();
        check(unsafe { sys::napi_coerce_to_bool(self.env, v, &mut b) })?;
        self.boolean_value(b)
    }

    /// The string's code units, or None for a value of another kind
    pub(crate) fn string(&self, v: napi_value) -> Result<Option<Units>> {
        if self.type_of(v)? != sys::ValueType::napi_string {
            return Ok(None);
        }
        let mut units = Vec::new();
        self.units_into(v, &mut units)?;
        // The units kept hold no more room than they take
        units.shrink_to_fit();
        Ok(Some(units))
    }

    /// The number, or None for a value of another kind
    pub(crate) fn number(&self, v: napi_value) -> Result<Option<f64>> {
        if self.type_of(v)? != sys::ValueType::napi_number {
            return Ok(None);
        }
        self.number_value(v).map(Some)
    }

    /// The array's elements, or None for a value that is no array
    pub(crate) fn elements(&self, v: napi_value) -> Result<Option<Vec<napi_value>>> {
        if !self.is_array(v)? {
            return Ok(None);
        }
        (0..self.length(v)?).map(|i| self.element(v, i)).collect::<Result<Vec<_>>>().map(Some)
    }

    /// A boolean's value; the value must be a boolean
    pub(crate) fn boolean_value(&self, v: napi_value) -> Result<bool> {
        let mut out = false;
        check(unsafe { sys::napi_get_value_bool(self.env, v, &mut out) })?;
        Ok(out)
    }

    /// A number's value; the value must be a number
    pub(crate) fn number_value(&self, v: napi_value) -> Result<f64> {
        let mut x = 0.0;
        check(unsafe { sys::napi_get_value_double(self.env, v, &mut x) })?;
        Ok(x)
    }

    /// A string's UTF-16 code units, lone surrogates included, into `units`, which a caller reading many strings keeps
    /// for every one of them: in one call when the string fits the room reserved, as nearly every string does, and
    /// otherwise in a second once its length is known. The value must be a string.
    pub(crate) fn units_into(&self, v: napi_value, units: &mut Vec<u16>) -> Result<()> {
        units.clear();
        // The room past the units is for the terminator Node-API writes
        units.reserve(4096);
        let mut room = units.capacity();
        let mut copied = 0;
        check(unsafe { sys::napi_get_value_string_utf16(self.env, v, units.as_mut_ptr(), room, &mut copied) })?;
        if copied + 1 == room {
            let mut length = 0;
            check(unsafe { sys::napi_get_value_string_utf16(self.env, v, ptr::null_mut(), 0, &mut length) })?;
            units.reserve(length + 1);
            room = units.capacity();
            check(unsafe { sys::napi_get_value_string_utf16(self.env, v, units.as_mut_ptr(), room, &mut copied) })?;
        }
        // SAFETY: Node-API wrote `copied` units into the reserved capacity, which is at least `copied + 1`
        unsafe { units.set_len(copied) };
        Ok(())
    }

    /// Whether the value is an array (`Array.isArray`)
    pub(crate) fn is_array(&self, v: napi_value) -> Result<bool> {
        let mut is = false;
        check(unsafe { sys::napi_is_array(self.env, v, &mut is) })?;
        Ok(is)
    }

    /// An array's length; the value must be an array
    pub(crate) fn length(&self, array: napi_value) -> Result<u32> {
        let mut len = 0;
        check(unsafe { sys::napi_get_array_length(self.env, array, &mut len) })?;
        Ok(len)
    }

    /// `array[index]`
    pub(crate) fn element(&self, array: napi_value, index: u32) -> Result<napi_value> {
        let mut e = ptr::null_mut();
        check(unsafe { sys::napi_get_element(self.env, array, index, &mut e) })?;
        Ok(e)
    }

    /// `Object.keys(object)`: an array of the object's own enumerable string keys, an integer key as its string, in
    /// the order the engine gives them; the value must be an object
    pub(crate) fn keys(&self, object: napi_value) -> Result<napi_value> {
        let mut keys = ptr::null_mut();
        check(unsafe {
            sys::napi_get_all_property_names(
                self.env,
                object,
                sys::KeyCollectionMode::own_only,
                sys::KeyFilter::enumerable | sys::KeyFilter::skip_symbols,
                sys::KeyConversion::numbers_to_strings,
                &mut keys,
            )
        })?;
        Ok(keys)
    }

    /// `object[key]` for a key that is a JavaScript value; the value must be an object
    pub(crate) fn property(&self, object: napi_value, key: napi_value) -> Result<napi_value> {
        let mut v = ptr::null_mut();
        check(unsafe { sys::napi_get_property(self.env, object, key, &mut v) })?;
        Ok(v)
    }

    /// `f`'s result, with every handle it created let go once it returns, so that a walk through a large value holds
    /// only one path's worth; what `f` gives back must hold none of them. A scope that fails to close fails the call.
    pub(crate) fn scoped<T>(&self, f: impl FnOnce() -> Result<T>) -> Result<T> {
        let mut scope = ptr::null_mut();
        check(unsafe { sys::napi_open_handle_scope(self.env, &mut scope) })?;
        let out = f();
        check(unsafe { sys::napi_close_handle_scope(self.env, scope) })?;
        out
    }

    pub(crate) fn undefined(&self) -> Result<napi_value> {
        let mut v = ptr::null_mut();
        check(unsafe { sys::napi_get_undefined(self.env, &mut v) })?;
        Ok(v)
    }

    pub(crate) fn null(&self) -> Result<napi_value> {
        let mut v = ptr::null_mut();
        check(unsafe { sys::napi_get_null(self.env, &mut v) })?;
        Ok(v)
    }

    pub(crate) fn boolean(&self, b: bool) -> Result<napi_value> {
        let mut v = ptr::null_mut();
        check(unsafe { sys::napi_get_boolean(self.env, b, &mut v) })?;
        Ok(v)
    }

    pub(crate) fn num(&self, x: f64) -> Result<napi_value> {
        let mut v = ptr::null_mut();
        check(unsafe { sys::napi_create_double(self.env, x, &mut v) })?;
        Ok(v)
    }

    /// A number, or null for None
    pub(crate) fn num_or_null(&self, x: Option<f64>) -> Result<napi_value> {
        x.map_or_else(|| self.null(), |x| self.num(x))
    }

    pub(crate) fn text(&self, units: &[u16]) -> Result<napi_value> {
        let mut v = ptr::null_mut();
        check(unsafe { sys::napi_create_string_utf16(self.env, units.as_ptr(), units.len() as isize, &mut v) })?;
        Ok(v)
    }

    /// A string, or null for None
    pub(crate) fn text_or_null(&self, units: Option<&Units>) -> Result<napi_value> {
        units.map_or_else(|| self.null(), |u| self.text(u))
    }

    /// A new object holding `members` in order. Each key is a name the module writes, never `__proto__`, so a plain
    /// assignment creates an own property.
    pub(crate) fn object(&self, members: &[(&str, napi_value)]) -> Result<napi_value> {
        let mut o = ptr::null_mut();
        check(unsafe { sys::napi_create_object(self.env, &mut o) })?;
        for (key, value) in members {
            let name = CString::new(*key).map_err(|e| Error::from_reason(e.to_string()))?;
            check(unsafe { sys::napi_set_named_property(self.env, o, name.as_ptr(), *value) })?;
        }
        Ok(o)
    }

    /// A new array of `items`
    pub(crate) fn array(&self, items: impl IntoIterator<Item = Result<napi_value>>) -> Result<napi_value> {
        let mut a = ptr::null_mut();
        check(unsafe { sys::napi_create_array(self.env, &mut a) })?;
        for (i, item) in items.into_iter().enumerate() {
            check(unsafe { sys::napi_set_element(self.env, a, i as u32, item?) })?;
        }
        Ok(a)
    }

    /// A question index as the token cache stores it, `[start, end, turnEnd, at, tools, subagents, fingerprint]` for
    /// each question: the one part of an entry whose shape every side shares (`QuestionRec`)
    pub(crate) fn records(&self, records: &[Record]) -> Result<napi_value> {
        self.array(records.iter().map(|q| {
            self.array([
                self.num(q.start),
                self.num(q.end),
                self.num(q.turn_end),
                self.num_or_null(q.at),
                self.num(q.tools),
                self.num(q.subagents),
                self.num(q.fingerprint),
            ])
        }))
    }

    /// `globalThis[holder][function]`, called with one argument
    fn call_global(&self, holder: &str, function: &str, argument: napi_value) -> Result<napi_value> {
        let mut global = ptr::null_mut();
        check(unsafe { sys::napi_get_global(self.env, &mut global) })?;
        let holder = self.get(global, holder)?;
        let f = self.get(holder, function)?;
        let mut out = ptr::null_mut();
        check(unsafe { sys::napi_call_function(self.env, holder, f, 1, &argument, &mut out) })?;
        Ok(out)
    }

    /// The value `JSON.parse` gives for `text`, a value the module read and checked against its grammar: the value a
    /// line holds there, exactly as JavaScript would hold it, built by JavaScript itself
    pub(crate) fn parse_json(&self, text: &str) -> Result<napi_value> {
        let mut s = ptr::null_mut();
        check(unsafe { sys::napi_create_string_utf8(self.env, text.as_ptr().cast(), text.len() as isize, &mut s) })?;
        self.call_global("JSON", "parse", s)
    }

    /// `Date.parse(text)`; NaN when the call fails
    pub(crate) fn date_parse(&self, text: &[u16]) -> f64 {
        let parsed = self.text(text).and_then(|s| self.call_global("Date", "parse", s)).and_then(|v| self.number(v));
        parsed.ok().flatten().unwrap_or(f64::NAN)
    }

    /// What a call that may throw gives: None when it threw, the exception then cleared so the call into the module
    /// goes on
    fn caught(&self, status: sys::napi_status, out: napi_value) -> Result<Option<napi_value>> {
        if status == sys::Status::napi_pending_exception {
            let mut exception = ptr::null_mut();
            check(unsafe { sys::napi_get_and_clear_last_exception(self.env, &mut exception) })?;
            return Ok(None);
        }
        check(status)?;
        Ok(Some(out))
    }

    /// `receiver[method](...arguments)`; None when it throws
    fn call_method(&self, receiver: napi_value, method: &str, arguments: &[napi_value]) -> Result<Option<napi_value>> {
        let name = CString::new(method).map_err(|e| Error::from_reason(e.to_string()))?;
        let mut f = ptr::null_mut();
        check(unsafe { sys::napi_get_named_property(self.env, receiver, name.as_ptr(), &mut f) })?;
        let mut out = ptr::null_mut();
        let status = unsafe { sys::napi_call_function(self.env, receiver, f, arguments.len(), arguments.as_ptr(), &mut out) };
        self.caught(status, out)
    }

    /// Node's built-in module `id`, as `process.getBuiltinModule(id)` gives it on any thread
    fn builtin(&self, id: &str) -> Result<napi_value> {
        let mut global = ptr::null_mut();
        check(unsafe { sys::napi_get_global(self.env, &mut global) })?;
        let process = self.get(global, "process")?;
        let id = self.text(&crate::text::units(id))?;
        self.call_method(process, "getBuiltinModule", &[id])?.ok_or_else(|| Error::from_reason("process.getBuiltinModule threw"))
    }

    /// `text.toLowerCase()`
    pub(crate) fn lower_case(&self, text: &[u16]) -> Result<Units> {
        let s = self.text(text)?;
        let lower = self.call_method(s, "toLowerCase", &[])?.ok_or_else(|| Error::from_reason("toLowerCase threw"))?;
        self.string(lower)?.ok_or_else(|| Error::from_reason("toLowerCase gave no string"))
    }

    /// `os.tmpdir()`: the system temporary directory, as the application's own code finds it
    pub(crate) fn os_tmpdir(&self) -> Result<Units> {
        let os = self.builtin("node:os")?;
        let dir = self.call_method(os, "tmpdir", &[])?.ok_or_else(|| Error::from_reason("os.tmpdir threw"))?;
        self.string(dir)?.ok_or_else(|| Error::from_reason("os.tmpdir gave no string"))
    }

    /// `new URL(text)`; None when it throws, as it does for text that does not parse as a URL
    pub(crate) fn new_url(&self, text: &[u16]) -> Result<Option<napi_value>> {
        let mut global = ptr::null_mut();
        check(unsafe { sys::napi_get_global(self.env, &mut global) })?;
        let constructor = self.get(global, "URL")?;
        let s = self.text(text)?;
        let mut out = ptr::null_mut();
        let status = unsafe { sys::napi_new_instance(self.env, constructor, 1, &s, &mut out) };
        self.caught(status, out)
    }

    /// `fileURLToPath(url)` of Node's `url` module; None when it throws, as it does for a URL naming no local path
    pub(crate) fn file_url_to_path(&self, url: napi_value) -> Result<Option<Units>> {
        let module = self.builtin("node:url")?;
        match self.call_method(module, "fileURLToPath", &[url])? {
            Some(path) => self.string(path),
            None => Ok(None),
        }
    }

    /// The local dates of time values, as JavaScript's `Date` reads them in the time zone the process runs in
    pub(crate) fn local_dates(&self) -> Result<LocalDates<'_>> {
        let mut global = ptr::null_mut();
        check(unsafe { sys::napi_get_global(self.env, &mut global) })?;
        let prototype = self.get(self.get(global, "Date")?, "prototype")?;
        Ok(LocalDates {
            js: self,
            getters: [self.get(prototype, "getFullYear")?, self.get(prototype, "getMonth")?, self.get(prototype, "getDate")?],
        })
    }
}

/// `Date.prototype`'s local-date getters, taken once for every time value they are asked about
pub(crate) struct LocalDates<'j> {
    js: &'j Js,
    getters: [napi_value; 3],
}

impl LocalDates<'_> {
    /// `[getFullYear(), getMonth(), getDate()]` of `new Date(ms)`
    pub(crate) fn of(&self, ms: f64) -> Result<[f64; 3]> {
        let mut date = ptr::null_mut();
        check(unsafe { sys::napi_create_date(self.js.env, ms, &mut date) })?;
        let mut out = [f64::NAN; 3];
        for (field, getter) in out.iter_mut().zip(self.getters) {
            let mut v = ptr::null_mut();
            check(unsafe { sys::napi_call_function(self.js.env, date, getter, 0, ptr::null(), &mut v) })?;
            *field = self.js.number(v)?.unwrap_or(f64::NAN);
        }
        Ok(out)
    }
}
