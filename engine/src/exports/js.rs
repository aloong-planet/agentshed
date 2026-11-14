//! The conversions between JavaScript's values and the module's, for the exports and for each side's adapter, which
//! alone knows its job's and its entry's shape. Text crosses as UTF-16 code units both ways, so a lone surrogate in a
//! string comes back as it went in; a value the module only hands back crosses as the JavaScript value itself.

use std::ffi::CString;
use std::ptr;

use napi::sys::{self, napi_value};
use napi::{Env, Error, Result, Status};

use crate::question::Record;
use crate::text::Units;

fn check(status: sys::napi_status) -> Result<()> {
    if status == sys::Status::napi_ok { Ok(()) } else { Err(Error::from_status(Status::from(status))) }
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
        let mut out = false;
        check(unsafe { sys::napi_get_value_bool(self.env, b, &mut out) })?;
        Ok(out)
    }

    /// The string's code units, or None for a value of another kind
    pub(crate) fn string(&self, v: napi_value) -> Result<Option<Units>> {
        if self.type_of(v)? != sys::ValueType::napi_string {
            return Ok(None);
        }
        let mut len = 0;
        check(unsafe { sys::napi_get_value_string_utf16(self.env, v, ptr::null_mut(), 0, &mut len) })?;
        let mut buf = vec![0u16; len + 1];
        let mut written = 0;
        check(unsafe { sys::napi_get_value_string_utf16(self.env, v, buf.as_mut_ptr(), buf.len(), &mut written) })?;
        buf.truncate(written);
        Ok(Some(buf))
    }

    /// The number, or None for a value of another kind
    pub(crate) fn number(&self, v: napi_value) -> Result<Option<f64>> {
        if self.type_of(v)? != sys::ValueType::napi_number {
            return Ok(None);
        }
        let mut x = 0.0;
        check(unsafe { sys::napi_get_value_double(self.env, v, &mut x) })?;
        Ok(Some(x))
    }

    /// The array's elements, or None for a value that is no array
    pub(crate) fn elements(&self, v: napi_value) -> Result<Option<Vec<napi_value>>> {
        let mut is = false;
        check(unsafe { sys::napi_is_array(self.env, v, &mut is) })?;
        if !is {
            return Ok(None);
        }
        let mut len = 0;
        check(unsafe { sys::napi_get_array_length(self.env, v, &mut len) })?;
        (0..len)
            .map(|i| {
                let mut e = ptr::null_mut();
                check(unsafe { sys::napi_get_element(self.env, v, i, &mut e) })?;
                Ok(e)
            })
            .collect::<Result<Vec<_>>>()
            .map(Some)
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
}
