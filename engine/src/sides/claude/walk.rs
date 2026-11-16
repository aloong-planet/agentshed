//! The Claude Code side of the session walk: `projects/<encoded directory>/` under Claude Code's data root, every
//! `.jsonl` at any depth below a project's encoded directory a transcript of it. One directly in that directory is a
//! session; one deeper, below a session's directory, is a subagent's or another nested transcript. The walk names each
//! file's encoded directory and reads nothing of it: the project the directory maps to is the registry's, which the
//! planning reads (token-stats A2).

use crate::walk;
use crate::walk::Held;

/// The tree under Claude Code's data root the walk takes
pub(super) const TREE: &str = "projects";

/// A transcript, as the planning takes it (`TokenEngine.build` in src/main/providers/token-stats.ts)
pub(super) struct Session {
    pub(super) file: String,
    /// The name of the project directory it is below, as Claude Code encodes the project's path
    pub(super) dir: String,
    /// Whether it is below a directory inside the project directory rather than directly in it
    pub(super) nested: bool,
}

/// Every transcript under `tree` (`TREE` under the data root), in scan order; and apart, in scan order, the transcripts
/// of the files `held` names that the walk kept below a directory there that it could not list (token-stats, Failure
/// modes and boundaries: the token store)
pub(super) fn walk(tree: &str, held: &mut Held) -> (Vec<Session>, Vec<Session>) {
    let mut out = Vec::new();
    let mut apart = Vec::new();
    let Some(dirs) = walk::entries(tree) else {
        // One no longer there has lost its transcripts
        if !walk::is_absent(tree) {
            for (file, parts) in held.below(tree) {
                let [dir, rest @ ..] = parts.as_slice() else { continue };
                if !rest.is_empty() && transcript(&file) {
                    apart.push(Session { file, dir: dir.clone(), nested: rest.len() > 1 });
                }
            }
        }
        return (out, apart);
    };
    // A file in the projects directory itself, or a link there, is no project's
    for project in dirs {
        if project.kind == walk::Kind::Directory {
            walk_dir(&project.path, &project.name, false, held, &mut out, &mut apart);
        }
    }
    (out, apart)
}

/// The transcripts below `path`, a directory at or below the project directory `dir`: `nested` when it is below it
fn walk_dir(path: &str, dir: &str, nested: bool, held: &mut Held, out: &mut Vec<Session>, apart: &mut Vec<Session>) {
    let Some(entries) = walk::entries(path) else {
        if !walk::is_absent(path) {
            for (file, parts) in held.below(path) {
                if transcript(&file) {
                    apart.push(Session { file, dir: dir.to_owned(), nested: nested || parts.len() > 1 });
                }
            }
        }
        return;
    };
    for entry in entries {
        if entry.kind == walk::Kind::Directory {
            walk_dir(&entry.path, dir, true, held, out, apart);
        } else if transcript(&entry.name) {
            // A link is taken by its name, as any entry that is no directory
            out.push(Session { file: entry.path, dir: dir.to_owned(), nested });
        }
    }
}

/// Whether a file of this name in the tree is a transcript
fn transcript(name: &str) -> bool {
    name.ends_with(".jsonl")
}
