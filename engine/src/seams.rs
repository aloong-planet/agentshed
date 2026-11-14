//! The panic seam, compiled into builds made for tests only (the `test-seams` feature): a test names a file, and the
//! module panics while it parses that file, so that a test can show what a panic in the module does to a read. A
//! packaged build has none of it. Its exports are in `exports/tests.rs`, each named `seam_…`, and no export elsewhere
//! is (build.rs fails a build otherwise), so packaging's refusal of a module exporting a `seam…` name covers each
//! (scripts/build-engine.mjs).

/// Called by every function that parses a session file, before it reads the file: in a build made for tests, it
/// panics when the file is the one the seam names, and otherwise does nothing.
pub(crate) fn before_parse(file: &str) {
    #[cfg(feature = "test-seams")]
    {
        let named = NAMED.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone();
        if named.as_deref() == Some(file) {
            panic!("the panic seam, while parsing {file}");
        }
    }
    #[cfg(not(feature = "test-seams"))]
    let _ = file;
}

/// The file the module panics on; one for the whole process, as the module's code is shared by every thread
#[cfg(feature = "test-seams")]
static NAMED: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Names the file the module panics while parsing, or none
#[cfg(feature = "test-seams")]
pub(crate) fn name_panic_file(file: Option<String>) {
    *NAMED.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = file;
}
