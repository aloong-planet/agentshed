//! The panic seam, compiled into builds made for tests only (the `test-seams` feature): a test names a file, and the
//! module panics while it parses that file, so that a test can show what a panic in the module does to a read. A
//! packaged build has none of it. Every export here is named `seam_…`, and no export elsewhere is (build.rs fails a
//! build otherwise), so packaging's refusal of a module exporting a `seam…` name covers each (scripts/build-engine.mjs).

/// Called by every function that parses a session file, before it reads the file: in a build made for tests, it
/// panics when the file is the one the seam names, and otherwise does nothing.
#[cfg_attr(not(feature = "test-seams"), allow(dead_code))]
pub(crate) fn before_parse(file: &str) {
    #[cfg(feature = "test-seams")]
    {
        let named = panic_seam::NAMED.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone();
        if named.as_deref() == Some(file) {
            panic!("the panic seam, while parsing {file}");
        }
    }
    #[cfg(not(feature = "test-seams"))]
    let _ = file;
}

#[cfg(feature = "test-seams")]
mod panic_seam {
    use napi_derive::napi;
    use std::sync::Mutex;

    /// The file the module panics on; one for the whole process, as the module's code is shared by every thread
    pub(super) static NAMED: Mutex<Option<String>> = Mutex::new(None);

    /// Names the file the module panics while parsing, or none
    #[napi(catch_unwind)]
    pub fn seam_panic_while_parsing(file: Option<String>) {
        *NAMED.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = file;
    }

    /// A stand-in for a function that parses a session file, for the seam's own tests: it parses nothing, and answers
    /// with the file once the seam has let it through
    #[napi(catch_unwind)]
    pub fn seam_parse(file: String) -> String {
        super::before_parse(&file);
        file
    }
}
