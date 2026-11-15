//! A group's combined result, as the store keeps it, and the sum of the groups' results that a scan's figures are
//! (token-stats::CON-003).
//!
//! A result names its files by their place among the group's members, which the group keeps in scan order; the sum puts
//! each in its place in the scan. What the whole combination gave in an order — the usage rows, the projects, the
//! sessions of one time — is given here by where it was first touched: a file's place in the scan, then the touch's
//! place in that file (and, for a project, the phase of the combination that touched it, as `combine` in
//! src/main/providers/token-stats.ts touched Claude's projects through its kept entries first, then through its
//! sessions, then the other sides'). The sum orders everything by that, which is the order one combination over every
//! file of the scan set, in scan order, touched it.
//!
//! The figures are summed in another order than one combination adds them: group by group. Every figure the sides give
//! is an integer below 2^53 (none above 2^40 on this machine's data, 1,624,060 figures, 2026-11-15), and while every sum
//! is one too, double addition gives the same result in any order, bit for bit.

use std::cmp::Ordering;
use std::collections::HashMap;

use crate::text::{Units, units};

/// One usage row's share from a group: day × side × project × model, with its five figures — input, output, cache
/// reads, cache writes, total — and where it was first touched (`member`, `k`)
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Row {
    pub(crate) member: u32,
    pub(crate) k: u32,
    /// Empty for a usage no time files under a day
    pub(crate) day: Units,
    pub(crate) side: Units,
    pub(crate) project: Units,
    pub(crate) model: Units,
    pub(crate) figures: [f64; 5],
}

/// A project the combination touched, and where it first did
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Project {
    pub(crate) phase: u8,
    pub(crate) member: u32,
    pub(crate) k: u32,
    pub(crate) key: Units,
}

/// A session as the session list shows it (`SessionMeta`), with its project and its file's place among the members
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Session {
    pub(crate) member: u32,
    pub(crate) project: Units,
    pub(crate) side: Units,
    pub(crate) title: Option<Units>,
    pub(crate) at: Option<f64>,
    pub(crate) tokens: f64,
    pub(crate) file: Units,
    pub(crate) questions: f64,
    pub(crate) fork: Fork,
    /// A stripped Codex fork titled by its first question: the first question left, by its byte range, whose live text
    /// titles it once the scan has summed (`retitleStripped`)
    pub(crate) retitle: Option<[f64; 2]>,
}

/// A session's fork state (`ForkState`)
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Fork {
    None,
    Stripped,
    Uncertain,
}

impl Fork {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Fork::None => "none",
            Fork::Stripped => "stripped",
            Fork::Uncertain => "uncertain",
        }
    }

    fn of(code: u8) -> Option<Self> {
        Some(match code {
            0 => Fork::None,
            1 => Fork::Stripped,
            2 => Fork::Uncertain,
            _ => return None,
        })
    }

    fn code(self) -> u8 {
        match self {
            Fork::None => 0,
            Fork::Stripped => 1,
            Fork::Uncertain => 2,
        }
    }
}

/// What one group's combination gives
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct GroupResult {
    pub(crate) rows: Vec<Row>,
    pub(crate) projects: Vec<Project>,
    pub(crate) sessions: Vec<Session>,
    /// The members the read allow-list admits
    pub(crate) allow: Vec<u32>,
    /// The Antigravity conversations that cannot be read in the supported format
    pub(crate) unreadable: f64,
}

/// The key a usage row is merged by: `${day}|${side}|${projectKey}|${model}`, the very text the combination keyed it by
fn row_key(day: &[u16], side: &[u16], project: &[u16], model: &[u16]) -> Units {
    let bar = u16::from(b'|');
    let mut key = Vec::with_capacity(day.len() + side.len() + project.len() + model.len() + 3);
    for (i, part) in [day, side, project, model].into_iter().enumerate() {
        if i > 0 {
            key.push(bar);
        }
        key.extend_from_slice(part);
    }
    key
}

/// A group's result as its side's combination builds it, touch by touch
#[derive(Default)]
pub(crate) struct Builder {
    result: GroupResult,
    rows: HashMap<Units, usize>,
    projects: HashMap<Units, ()>,
}

impl Builder {
    /// Adds a usage to its row (`addRow`): the row is made at its first touch, which is where it is placed, and each
    /// figure is added in the order the touches come
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn row(&mut self, member: u32, k: u32, day: Option<&[u16]>, side: &str, project: &[u16], model: &[u16], figures: [f64; 5]) {
        let day = day.unwrap_or(&[]);
        let side = units(side);
        let key = row_key(day, &side, project, model);
        match self.rows.get(&key) {
            Some(&at) => {
                let row = &mut self.result.rows[at];
                for (sum, x) in row.figures.iter_mut().zip(figures) {
                    *sum += x;
                }
            }
            None => {
                self.rows.insert(key, self.result.rows.len());
                // Each figure added to a zero, as the combination added the first touch's
                let figures = figures.map(|x| 0.0 + x);
                self.result.rows.push(Row { member, k, day: day.to_vec(), side, project: project.to_vec(), model: model.to_vec(), figures });
            }
        }
    }

    /// Touches a project (`projectOf`): placed by its first touch
    pub(crate) fn project(&mut self, phase: u8, member: u32, k: u32, key: &[u16]) {
        if self.projects.insert(key.to_vec(), ()).is_none() {
            self.result.projects.push(Project { phase, member, k, key: key.to_vec() });
        }
    }

    pub(crate) fn session(&mut self, session: Session) {
        self.result.sessions.push(session);
    }

    pub(crate) fn unreadable(&mut self) {
        self.result.unreadable += 1.0;
    }

    /// The result, with the members the read allow-list admits
    pub(crate) fn finish(mut self, allow: Vec<u32>) -> GroupResult {
        self.result.allow = allow;
        self.result
    }
}

// ── The encoding the store keeps a result in: numbers little-endian, text as UTF-16 code units, each list and each
// text led by its length ──

struct Out(Vec<u8>);

impl Out {
    fn byte(&mut self, b: u8) {
        self.0.push(b);
    }
    fn count(&mut self, n: usize) {
        self.0.extend_from_slice(&(n as u32).to_le_bytes());
    }
    fn number(&mut self, x: f64) {
        self.0.extend_from_slice(&x.to_le_bytes());
    }
    fn maybe_number(&mut self, x: Option<f64>) {
        match x {
            Some(x) => {
                self.byte(1);
                self.number(x);
            }
            None => self.byte(0),
        }
    }
    fn text(&mut self, t: &[u16]) {
        self.count(t.len());
        for u in t {
            self.0.extend_from_slice(&u.to_le_bytes());
        }
    }
    fn maybe_text(&mut self, t: Option<&Units>) {
        match t {
            Some(t) => {
                self.byte(1);
                self.text(t);
            }
            None => self.byte(0),
        }
    }
}

struct In<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl In<'_> {
    fn take(&mut self, n: usize) -> Option<&[u8]> {
        let end = self.at.checked_add(n)?;
        let taken = self.bytes.get(self.at..end)?;
        self.at = end;
        Some(taken)
    }
    fn byte(&mut self) -> Option<u8> {
        self.take(1).map(|b| b[0])
    }
    fn count(&mut self) -> Option<usize> {
        self.take(4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
    }
    fn index(&mut self) -> Option<u32> {
        self.count().map(|n| n as u32)
    }
    fn number(&mut self) -> Option<f64> {
        self.take(8).map(|b| f64::from_le_bytes(b.try_into().unwrap_or([0; 8])))
    }
    fn maybe_number(&mut self) -> Option<Option<f64>> {
        match self.byte()? {
            0 => Some(None),
            1 => self.number().map(Some),
            _ => None,
        }
    }
    fn text(&mut self) -> Option<Units> {
        let n = self.count()?;
        let bytes = self.take(n.checked_mul(2)?)?;
        Some(bytes.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect())
    }
    fn maybe_text(&mut self) -> Option<Option<Units>> {
        match self.byte()? {
            0 => Some(None),
            1 => self.text().map(Some),
            _ => None,
        }
    }
    /// A list's length, when the bytes left could hold that many items of at least `least` bytes each
    fn list(&mut self, least: usize) -> Option<usize> {
        let n = self.count()?;
        (n.checked_mul(least)? <= self.bytes.len() - self.at).then_some(n)
    }
}

impl GroupResult {
    pub(crate) fn encode(&self) -> Vec<u8> {
        let mut o = Out(Vec::new());
        o.count(self.rows.len());
        for r in &self.rows {
            o.count(r.member as usize);
            o.count(r.k as usize);
            o.text(&r.day);
            o.text(&r.side);
            o.text(&r.project);
            o.text(&r.model);
            for x in r.figures {
                o.number(x);
            }
        }
        o.count(self.projects.len());
        for p in &self.projects {
            o.byte(p.phase);
            o.count(p.member as usize);
            o.count(p.k as usize);
            o.text(&p.key);
        }
        o.count(self.sessions.len());
        for s in &self.sessions {
            o.count(s.member as usize);
            o.text(&s.project);
            o.text(&s.side);
            o.maybe_text(s.title.as_ref());
            o.maybe_number(s.at);
            o.number(s.tokens);
            o.text(&s.file);
            o.number(s.questions);
            o.byte(s.fork.code());
            match s.retitle {
                Some([start, end]) => {
                    o.byte(1);
                    o.number(start);
                    o.number(end);
                }
                None => o.byte(0),
            }
        }
        o.count(self.allow.len());
        for &m in &self.allow {
            o.count(m as usize);
        }
        o.number(self.unreadable);
        o.0
    }

    /// The result a stored encoding holds, when it reads back whole and names no member past `members`; None otherwise
    pub(crate) fn decode(bytes: &[u8], members: usize) -> Option<Self> {
        let mut i = In { bytes, at: 0 };
        let member = |m: u32| (m as usize) < members;
        let mut out = GroupResult::default();
        for _ in 0..i.list(8)? {
            let (m, k) = (i.index()?, i.index()?);
            let (day, side, project, model) = (i.text()?, i.text()?, i.text()?, i.text()?);
            let figures = [i.number()?, i.number()?, i.number()?, i.number()?, i.number()?];
            if !member(m) {
                return None;
            }
            out.rows.push(Row { member: m, k, day, side, project, model, figures });
        }
        for _ in 0..i.list(9)? {
            let phase = i.byte()?;
            let (m, k, key) = (i.index()?, i.index()?, i.text()?);
            if !member(m) {
                return None;
            }
            out.projects.push(Project { phase, member: m, k, key });
        }
        for _ in 0..i.list(4)? {
            let m = i.index()?;
            let (project, side, title, at, tokens) = (i.text()?, i.text()?, i.maybe_text()?, i.maybe_number()?, i.number()?);
            let (file, questions, fork) = (i.text()?, i.number()?, Fork::of(i.byte()?)?);
            let retitle = match i.byte()? {
                0 => None,
                1 => Some([i.number()?, i.number()?]),
                _ => return None,
            };
            if !member(m) {
                return None;
            }
            out.sessions.push(Session { member: m, project, side, title, at, tokens, file, questions, fork, retitle });
        }
        for _ in 0..i.list(4)? {
            let m = i.index()?;
            if !member(m) {
                return None;
            }
            out.allow.push(m);
        }
        out.unreadable = i.number()?;
        (i.at == bytes.len()).then_some(out)
    }
}

/// A place in the scan: a file's place, then the touch's place in it
type Place = (u32, u32);

/// The groups' results summed (token-stats::CON-003)
#[derive(Default)]
pub(crate) struct Sum {
    rows: HashMap<Units, usize>,
    row_list: Vec<(Place, Row)>,
    projects: HashMap<Units, (u8, u32, u32)>,
    sessions: Vec<(u32, Session)>,
    allow: Vec<u32>,
    unreadable: f64,
}

/// What a scan derives from the token cache, in the order one combination gives it
pub(crate) struct Summed {
    pub(crate) rows: Vec<Row>,
    /// Each project with its sessions, newest first
    pub(crate) projects: Vec<(Units, Vec<Session>)>,
    /// The places in the scan of the files the read allow-list admits
    pub(crate) allow: Vec<u32>,
    pub(crate) unreadable: f64,
}

impl Sum {
    /// Adds a group's result; `places` are its members' places in the scan, in the group's order
    pub(crate) fn add(&mut self, result: &GroupResult, places: &[u32]) {
        let place = |m: u32| places[m as usize];
        for r in &result.rows {
            let at = (place(r.member), r.k);
            let key = row_key(&r.day, &r.side, &r.project, &r.model);
            match self.rows.get(&key) {
                Some(&i) => {
                    let (first, row) = &mut self.row_list[i];
                    for (sum, x) in row.figures.iter_mut().zip(r.figures) {
                        *sum += x;
                    }
                    if at < *first {
                        // The row is the first touch's, as the combination made it there
                        *first = at;
                        let figures = row.figures;
                        *row = Row { figures, ..r.clone() };
                    }
                }
                None => {
                    self.rows.insert(key, self.row_list.len());
                    self.row_list.push((at, r.clone()));
                }
            }
        }
        for p in &result.projects {
            let at = (p.phase, place(p.member), p.k);
            self.projects.entry(p.key.clone()).and_modify(|first| *first = (*first).min(at)).or_insert(at);
        }
        for s in &result.sessions {
            self.sessions.push((place(s.member), s.clone()));
        }
        self.allow.extend(result.allow.iter().map(|&m| place(m)));
        self.unreadable += result.unreadable;
    }

    pub(crate) fn finish(mut self) -> Summed {
        self.row_list.sort_by(|a, b| a.0.cmp(&b.0));
        let mut projects: Vec<((u8, u32, u32), Units)> = self.projects.into_iter().map(|(key, at)| (at, key)).collect();
        projects.sort();
        let mut by_project: HashMap<Units, Vec<Session>> = HashMap::new();
        // Pushed in scan order, then put newest first, those of one time staying in scan order (a stable sort by
        // `(y.at ?? 0) - (x.at ?? 0)`)
        self.sessions.sort_by_key(|(place, _)| *place);
        for (_, s) in self.sessions {
            by_project.entry(s.project.clone()).or_default().push(s);
        }
        let projects = projects
            .into_iter()
            .map(|(_, key)| {
                let mut sessions = by_project.remove(&key).unwrap_or_default();
                sessions.sort_by(|x, y| {
                    let d = y.at.unwrap_or(0.0) - x.at.unwrap_or(0.0);
                    if d > 0.0 {
                        Ordering::Greater
                    } else if d < 0.0 {
                        Ordering::Less
                    } else {
                        Ordering::Equal
                    }
                });
                (key, sessions)
            })
            .collect();
        self.allow.sort_unstable();
        Summed { rows: self.row_list.into_iter().map(|(_, r)| r).collect(), projects, allow: self.allow, unreadable: self.unreadable }
    }
}
