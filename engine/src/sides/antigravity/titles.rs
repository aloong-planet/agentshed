//! agy's own conversation titles, from its summaries database (`<data root>/conversation_summaries.db`, the index its
//! `/resume` list reads), read under token-stats::CON-002 as a conversation is (session-view::REQ-003/AC-03).

use std::path::Path;

use super::db::{self, Cell};
use crate::text;

/// Each conversation's title, by conversation id, in the table's order (a later row for the same id overrides an
/// earlier one, as JavaScript's `Map` set row by row keeps it): a conversation agy left untitled — its row's title
/// empty, as for a fork or a subagent (measured) — is left out. Empty when the database is not there or will not read in
/// the shape titles are read from (its table with `conversation_id` and `title`), so the titles fall back to the first
/// question; None when the read failed while agy was writing it, so that the caller keeps the titles it last read.
pub(super) fn read(home: &Path, tmp_parent: &Path) -> Option<Vec<(String, String)>> {
    let path = home.join("conversation_summaries.db");
    let Some(file) = path.to_str() else { return Some(Vec::new()) };
    if !path.exists() {
        return Some(Vec::new());
    }
    let log_before = db::has_log(file);
    let read = db::read(file, tmp_parent, |conn| {
        let mut titles = Vec::new();
        db::each_row(conn, "SELECT conversation_id, title FROM conversation_summaries", |cells| {
            if let (Some(Cell::Text(id)), Some(Cell::Text(title))) = (cells.first(), cells.get(1)) {
                if !id.is_empty() && !text::trim(&text::units(title)).is_empty() {
                    titles.push((id.clone(), title.clone()));
                }
            }
            Ok(())
        })?;
        Ok(titles)
    });
    match read {
        Ok(titles) => Some(titles),
        Err(_) if db::failed_while_written(file, log_before) => None,
        Err(_) => Some(Vec::new()),
    }
}
