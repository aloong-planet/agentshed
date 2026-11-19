//! Called by the tests: the test seams (`seams.rs`), exported only from a build made for tests. Every export here is
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

    /// Names the entry the module panics while the session walk reads it, or none
    #[napi(catch_unwind)]
    pub fn seam_panic_while_walking(file: Option<String>) {
        seams::name_walk_panic_file(file);
    }

    /// Names the file the module panics on while it reads that file's ranges or one of its turns, or none
    #[napi(catch_unwind)]
    pub fn seam_panic_while_reading(file: Option<String>) {
        seams::name_read_panic_file(file);
    }

    /// Names the file the module panics on while it assembles the blocks of one of its turns, or none
    #[napi(catch_unwind)]
    pub fn seam_panic_while_assembling(file: Option<String>) {
        seams::name_assembly_panic_file(file);
    }

    /// Holds every read of `file`'s ranges or turns, and every full-text search of it, at the hold seam's gate from now on, until
    /// it is released
    #[napi(catch_unwind)]
    pub fn seam_hold_reads_of(file: String) {
        seams::hold_seam::hold(file);
    }

    /// Releases the reads of `file`, or of every file
    #[napi(catch_unwind)]
    pub fn seam_release_reads_of(file: Option<String>) {
        seams::hold_seam::release(file);
    }

    /// The file of each read waiting at the hold seam's gate now, in the order they came to it
    #[napi(catch_unwind)]
    pub fn seam_reads_held() -> Vec<String> {
        seams::hold_seam::waiting()
    }

    /// A stand-in for a function that parses a session file, for the seam's own tests: it parses nothing, and answers
    /// with the file once the seam has let it through
    #[napi(catch_unwind)]
    pub fn seam_parse(file: String) -> String {
        seams::before_parse(&file);
        file
    }

    /// Makes the next write to a token store fail after this many of its statements, or no write fail
    #[napi(catch_unwind)]
    pub fn seam_cut_store_write_after(statements: Option<u32>) {
        seams::store_write_seam::cut_after(statements);
    }

    /// A directory the module made to copy one of agy's databases into, as the copy seam noted it
    #[napi(object)]
    pub struct SeamCopyDir {
        pub path: String,
        pub mode: u32,
    }

    /// Watches the directories the module makes in `parent` to copy agy's databases into, or none
    #[napi(catch_unwind)]
    pub fn seam_watch_copies_under(parent: Option<String>) {
        seams::copy_seam::watch(parent);
    }

    /// Each directory made in the watched one since it was named (`seams.rs`)
    #[napi(catch_unwind)]
    pub fn seam_copies_made() -> Vec<SeamCopyDir> {
        seams::copy_seam::made().into_iter().map(|(path, mode)| SeamCopyDir { path, mode }).collect()
    }

    /// Runs one statement against the token store in `dir`, bound to `params` (text or null), on a connection of its
    /// own, and answers with the rows it gives (`seams.rs`)
    #[napi(catch_unwind)]
    pub fn seam_store_statement(dir: String, sql: String, params: Vec<Option<String>>) -> napi::Result<Vec<Vec<Option<String>>>> {
        seams::store_statement_seam::run(&dir, &sql, &params).map_err(napi::Error::from_reason)
    }

    /// Reads `file` through the line reader every parse reads a session file by, through its zstd stream when it is
    /// `cold`, and answers with how many lines it gave; throws when it cannot be read to its end (`seams.rs`)
    #[napi(catch_unwind)]
    pub fn seam_each_line(file: String, cold: bool) -> napi::Result<u32> {
        seams::line_reader_seam::count(&file, cold).map_err(napi::Error::from_reason)
    }

    /// Holds the lines the line reader takes from `file` to `limit` bytes from now on, or to the reader's own limit
    /// again (`seams.rs`)
    #[napi(catch_unwind)]
    pub fn seam_limit_lines_of(file: String, limit: Option<u32>) {
        seams::line_limit_seam::limit(file, limit);
    }

    /// Has every read of one of `file`'s turns from now on hand over, for its body, the lines the read kept, in place of
    /// the body its side makes of them, or, given false, the body again (`seams.rs`)
    #[napi(catch_unwind)]
    pub fn seam_observe_turn_reads_of(file: String, observed: bool) {
        seams::observed_reads_seam::observe(file, observed);
    }

    /// Lowers `text` by the rule the full-text search's snippets lower strings by, `toLowerCase`'s (`seams.rs`)
    #[napi(catch_unwind)]
    pub fn seam_to_lower_case(text: napi::bindgen_prelude::Utf16String) -> napi::bindgen_prelude::Utf16String {
        crate::text::to_lower_case(&text).into()
    }

    /// Reads `text` as one string value through the reader every line is read by, and answers with the string, or null
    /// when the reader refuses the text (`seams.rs`)
    #[napi(catch_unwind)]
    pub fn seam_read_json_string(text: String) -> Option<String> {
        seams::json_string_seam::read(&text).map(|units| String::from_utf16_lossy(&units))
    }
}
