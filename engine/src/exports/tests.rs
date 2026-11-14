//! Called by the tests: the panic seam (`seams.rs`), exported only from a build made for tests. Every export here is
//! named `seam_…` and compiled only with the `test-seams` feature, which engine/build.rs checks on each.

#[cfg(feature = "test-seams")]
mod seam {
    use napi_derive::napi;

    use crate::seams;

    /// Names the file the module panics while parsing, or none
    #[napi(catch_unwind)]
    pub fn seam_panic_while_parsing(file: Option<String>) {
        seams::name_panic_file(file);
    }

    /// A stand-in for a function that parses a session file, for the seam's own tests: it parses nothing, and answers
    /// with the file once the seam has let it through
    #[napi(catch_unwind)]
    pub fn seam_parse(file: String) -> String {
        seams::before_parse(&file);
        file
    }
}
