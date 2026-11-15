//! The grouping and the combination (token-stats::CON-003; token-stats, Implementation Decisions, Cache): the scan's
//! entries combined group by group, each group's result kept in the store with its input and the combination it came
//! from, and the scan's figures the stored results summed.
//!
//! - A **group** is the set of files linked, directly or through others, by a de-duplication key they share; a file
//!   with none is a group alone. Which keys an entry carries is its side's to say (`Side::decode`); a key is hashed with
//!   its side, so a group never mixes sides but by a hash two keys share, which only joins two groups whose combination
//!   is the same apart.
//! - A group's **input** is, file by file in scan order, its entry (the write that held it), its admission to the read
//!   allow-list and a title read beside it. A group whose members, their order, its input or the combination differ from
//!   the ones its stored result came from, or whose stored result does not read back, is combined again, with every
//!   group its files now share a key with; nothing else is read.
//! - A scan that changes nothing writes nothing and holds no write lock. One that does holds the store's write lock
//!   from its first read to its commit, so another process's write lands before it or after it (token-stats C27); one
//!   that cannot take the lock combines from what it reads, writes nothing, and says why.
//! - An entry the scan finds not well formed while combining is the caller's to parse again: the scan writes nothing
//!   and names those files.

mod entry;
mod result;

pub(crate) use self::entry::{Fields, boolean, field, number, number_or_null, read, string, string_or_null};
pub(crate) use self::result::{Builder, Fork, GroupResult, Session, Summed};

use std::collections::HashMap;

use napi::Error;
use rusqlite::Connection;

use self::result::Sum;
use crate::exports::js::LocalDates;
use crate::sides::{self, Side};
use crate::store::{self, Facts, Head, Put, Store};
use crate::text::Units;

/// What a side reads of an entry for the store: its de-duplication keys' texts, and its facts
pub(crate) struct Decoded {
    pub(crate) keys: Vec<Units>,
    pub(crate) facts: Facts,
}

/// One member of a group, as its side's combination is given it: its place among the group's members, its aggregate's
/// text, and a title read beside it
pub(crate) struct Member<'a> {
    pub(crate) index: u32,
    pub(crate) agg: &'a str,
    pub(crate) title: Option<&'a [u16]>,
}

/// One file of a scan, in scan order: its new entry when a parse gave it one (otherwise the one the store holds), its
/// admission to the read allow-list, and a title read beside it
pub(crate) struct ScanFile {
    pub(crate) path: String,
    pub(crate) put: Option<Put>,
    pub(crate) admitted: bool,
    pub(crate) title: Option<Units>,
}

/// What a scan gives
pub(crate) enum Scanned {
    /// The scan's figures, and why the store could not be read or written, when it could not; what could not be written
    /// costs the next scan the work again
    Summed { summed: Summed, failure: Option<String> },
    /// Files whose stored entry is not one the combination can read, which the caller parses again; nothing was
    /// written. `failure` says why the store could not be read, when that is the reason.
    Bad { files: Vec<String>, failure: Option<String> },
}

/// `Math.max(0, x)`: NaN for NaN, and +0 for either zero
pub(crate) fn non_negative(x: f64) -> f64 {
    if x.is_nan() || x > 0.0 { x } else { 0.0 }
}

/// A key's stored form: a 64-bit FNV-1a hash of its side and its text
fn hash(kind: &str, text: &[u16]) -> i64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    let mut eat = |b: u8| {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    };
    kind.bytes().for_each(&mut eat);
    eat(0xff);
    text.iter().flat_map(|u| u.to_le_bytes()).for_each(&mut eat);
    h as i64
}

/// The side of an aggregate's text, when the text is a JSON object of a side the module reads
fn side_of(agg: &str) -> Option<&'static dyn Side> {
    let kind = entry::kind(agg)?;
    sides::named(&String::from_utf16_lossy(&kind))
}

/// What the store records beside an entry: its facts and its keys' hashes, once each; None when it is not well formed
pub(crate) fn decode(agg: &str) -> Option<(Facts, Vec<i64>)> {
    let decoded = side_of(agg)?.decode(agg)?;
    let mut keys: Vec<i64> = decoded.keys.iter().map(|k| hash(&decoded.facts.kind, k)).collect();
    keys.sort_unstable();
    keys.dedup();
    Some((decoded.facts, keys))
}

/// A group's input: for each member in scan order, the write that held its entry, its admission and its title
fn input(members: impl Iterator<Item = (i64, bool, Option<Units>)>) -> Vec<u8> {
    let mut out = Vec::new();
    for (rev, admitted, title) in members {
        out.extend_from_slice(&rev.to_le_bytes());
        out.push(u8::from(admitted));
        match title {
            Some(t) => {
                out.push(1);
                out.extend_from_slice(&(t.len() as u32).to_le_bytes());
                t.iter().for_each(|u| out.extend_from_slice(&u.to_le_bytes()));
            }
            None => out.push(0),
        }
    }
    out
}

/// Combines one group: its members in scan order, each its aggregate's text, admission and title. Err with the members
/// whose aggregate is not one the combination can read.
fn combine_group(dates: &LocalDates<'_>, members: &[(&str, bool, Option<&[u16]>)]) -> napi::Result<Result<GroupResult, Vec<usize>>> {
    let mut bad = Vec::new();
    // A group is of one side, but for two keys that share a hash: each side combines its own members
    let mut by_side: Vec<(&'static dyn Side, Vec<Member<'_>>)> = Vec::new();
    for (i, &(agg, _, title)) in members.iter().enumerate() {
        let Some(side) = side_of(agg) else {
            bad.push(i);
            continue;
        };
        let member = Member { index: i as u32, agg, title };
        match by_side.iter_mut().find(|(s, _)| std::ptr::addr_eq(*s, side)) {
            Some((_, list)) => list.push(member),
            None => by_side.push((side, vec![member])),
        }
    }
    let mut out = Builder::default();
    for (side, list) in &by_side {
        if let Err(i) = side.combine(dates, list, &mut out)? {
            bad.push(i as usize);
        }
    }
    if !bad.is_empty() {
        bad.sort_unstable();
        return Ok(Err(bad));
    }
    let allow = members.iter().enumerate().filter(|(_, m)| m.1).map(|(i, _)| i as u32).collect();
    Ok(Ok(out.finish(allow)))
}

/// Sets of files joined by a shared key (a union-find over the files' places)
struct Joined(Vec<usize>);

impl Joined {
    fn new(n: usize) -> Self {
        Joined((0..n).collect())
    }
    fn root(&mut self, mut i: usize) -> usize {
        while self.0[i] != i {
            self.0[i] = self.0[self.0[i]];
            i = self.0[i];
        }
        i
    }
    fn join(&mut self, a: usize, b: usize) {
        let (a, b) = (self.root(a), self.root(b));
        if a != b {
            // The earlier file is the root, so a group's root is its first file
            self.0[a.max(b)] = a.min(b);
        }
    }
}

/// The groups `files` (places, in scan order) fall into by the keys `keys_of` gives each: each group's places in scan
/// order, the groups in the order of their first files
fn components(files: &[usize], n: usize, mut keys_of: impl FnMut(usize) -> Result<Vec<i64>, String>) -> Result<Vec<Vec<usize>>, String> {
    let mut joined = Joined::new(n);
    let mut first: HashMap<i64, usize> = HashMap::new();
    for &f in files {
        for key in keys_of(f)? {
            match first.get(&key) {
                Some(&g) => joined.join(f, g),
                None => {
                    first.insert(key, f);
                }
            }
        }
    }
    let mut at: HashMap<usize, usize> = HashMap::new();
    let mut out: Vec<Vec<usize>> = Vec::new();
    for &f in files {
        let root = joined.root(f);
        let i = *at.entry(root).or_insert_with(|| {
            out.push(Vec::new());
            out.len() - 1
        });
        out[i].push(f);
    }
    Ok(out)
}

/// Combines entries held in memory, in scan order, as one combination over them gives: each aggregate's text, admission
/// and title. Err with the entries the combination cannot read. The restore (C16) and a build with no store take this.
pub(crate) fn combine_entries(dates: &LocalDates<'_>, entries: &[(&str, bool, Option<&[u16]>)]) -> napi::Result<Result<Summed, Vec<usize>>> {
    let mut keys = Vec::with_capacity(entries.len());
    let mut bad = Vec::new();
    for (i, (agg, _, _)) in entries.iter().enumerate() {
        match decode(agg) {
            Some((_, k)) => keys.push(k),
            None => {
                bad.push(i);
                keys.push(Vec::new());
            }
        }
    }
    if !bad.is_empty() {
        return Ok(Err(bad));
    }
    let all: Vec<usize> = (0..entries.len()).collect();
    let groups = components(&all, entries.len(), |f| Ok(keys[f].clone())).map_err(Error::from_reason)?;
    let mut sum = Sum::default();
    for group in &groups {
        let members: Vec<_> = group.iter().map(|&f| entries[f]).collect();
        match combine_group(dates, &members)? {
            Ok(result) => sum.add(&result, &group.iter().map(|&f| f as u32).collect::<Vec<_>>()),
            Err(members) => bad.extend(members.into_iter().map(|m| group[m])),
        }
    }
    if !bad.is_empty() {
        bad.sort_unstable();
        return Ok(Err(bad));
    }
    Ok(Ok(sum.finish()))
}

/// A stored group as this scan finds it
struct Group {
    id: i64,
    /// Its members' places in this scan, in its stored order; None when its row does not read back (a member list that
    /// is no list of numbers, or names a file the store does not hold or another group also names)
    members: Option<Vec<usize>>,
    /// Combined again by this scan
    dirty: bool,
}

/// What a scan finds in the store before it combines anything
struct Plan {
    /// Each file's number in the store, none for a file new to it
    ids: Vec<Option<i64>>,
    /// The write that holds each file's entry, a new entry's being the write this scan makes
    revs: Vec<i64>,
    /// The numbers of the files the store holds that this scan has no entry for
    removes: Vec<i64>,
    /// Files with no new entry whose stored entry the combination cannot read
    bad: Vec<String>,
    groups: Vec<Group>,
    /// Each file's group, when it is in one that reads back
    home: Vec<Option<usize>>,
    /// The files combined again, before the groups their keys reach are added
    seeds: Vec<usize>,
}

impl Plan {
    fn quiet(&self) -> bool {
        self.seeds.is_empty() && self.removes.is_empty() && self.bad.is_empty() && self.groups.iter().all(|g| g.members.is_some() && !g.dirty)
    }
}

fn plan(conn: &Connection, combination: &str, files: &[ScanFile]) -> Result<Plan, String> {
    let heads = store::heads(conn)?;
    let place: HashMap<&str, usize> = files.iter().enumerate().map(|(i, f)| (f.path.as_str(), i)).collect();
    let by_path: HashMap<&str, &Head> = heads.iter().map(|h| (h.path.as_str(), h)).collect();
    let mut rev = store::max_rev(conn)?;
    let (mut ids, mut revs, mut bad) = (Vec::with_capacity(files.len()), Vec::with_capacity(files.len()), Vec::new());
    for f in files {
        let head = by_path.get(f.path.as_str());
        ids.push(head.map(|h| h.id));
        if f.put.is_some() {
            rev += 1;
            revs.push(rev);
            continue;
        }
        match head {
            Some(Head { rev: Some(r), facts: Some(_), .. }) => revs.push(*r),
            // Given as held, but the store holds no entry there the grouping read: written meanwhile by another process,
            // or by a hand
            _ => {
                revs.push(0);
                bad.push(f.path.clone());
            }
        }
    }
    let removes: Vec<i64> = heads.iter().filter(|h| !place.contains_key(h.path.as_str())).map(|h| h.id).collect();
    let held: HashMap<i64, Option<usize>> = heads.iter().map(|h| (h.id, place.get(h.path.as_str()).copied())).collect();

    let mut groups = Vec::new();
    let mut claims: Vec<Vec<usize>> = vec![Vec::new(); files.len()];
    for stored in store::groups(conn)? {
        // A member the store does not hold makes the row unreadable; one the scan removes leaves the group to combine
        // again
        let mut removed = false;
        let members = stored.members.and_then(|ids| {
            let mut places = Vec::with_capacity(ids.len());
            for id in ids {
                match held.get(&id)? {
                    Some(p) => places.push(*p),
                    None => removed = true,
                }
            }
            Some(places)
        });
        let dirty = match &members {
            None => true,
            Some(places) => {
                let current = input(places.iter().map(|&p| (revs[p], files[p].admitted, files[p].title.clone())));
                removed
                    || stored.combination.as_deref() != Some(combination)
                    || stored.input.as_deref() != Some(current.as_slice())
                    || places.windows(2).any(|w| w[0] >= w[1])
                    || places.iter().any(|&p| files[p].put.is_some())
            }
        };
        if let Some(places) = &members {
            for &p in places {
                claims[p].push(groups.len());
            }
        }
        groups.push(Group { id: stored.id, members, dirty });
    }
    // A file two groups name: neither row reads back
    for claimed in &claims {
        if claimed.len() > 1 {
            for &g in claimed {
                groups[g].members = None;
                groups[g].dirty = true;
            }
        }
    }
    let mut home = vec![None; files.len()];
    for (g, group) in groups.iter().enumerate() {
        for &p in group.members.iter().flatten() {
            home[p] = Some(g);
        }
    }
    let seeds = (0..files.len())
        .filter(|&p| files[p].put.is_some() || home[p].is_none_or(|g| groups[g].dirty))
        .collect();
    Ok(Plan { ids, revs, removes, bad, groups, home, seeds })
}

/// The stored results of the groups not combined again, each with its group; a result that does not read back makes its
/// group one to combine again
fn stored_results(conn: &Connection, plan: &mut Plan) -> Result<Vec<(usize, GroupResult)>, String> {
    let at: HashMap<i64, usize> = plan.groups.iter().enumerate().map(|(g, group)| (group.id, g)).collect();
    let mut read: Vec<Option<GroupResult>> = vec![None; plan.groups.len()];
    store::results(conn, |id, bytes| {
        if let (Some(&g), Some(bytes)) = (at.get(&id), bytes) {
            let group = &plan.groups[g];
            if let (false, Some(members)) = (group.dirty, &group.members) {
                read[g] = GroupResult::decode(bytes, members.len());
            }
        }
    })?;
    let mut out = Vec::new();
    for (g, result) in read.into_iter().enumerate() {
        let group = &mut plan.groups[g];
        if group.dirty {
            continue;
        }
        match result {
            Some(result) => out.push((g, result)),
            None => {
                group.dirty = true;
                plan.seeds.extend(group.members.iter().flatten());
            }
        }
    }
    plan.seeds.sort_unstable();
    plan.seeds.dedup();
    Ok(out)
}

/// Scans `files`, in scan order: the store's entries and the new ones combined by group, each group combined again only
/// when it differs from what its stored result came from, the store left holding this scan's entries and results, and
/// the results summed. A new entry that is not well formed throws: the module's own parse made it.
pub(crate) fn scan(store: &Store, dates: &LocalDates<'_>, combination: &str, files: &[ScanFile]) -> napi::Result<Scanned> {
    let mut decoded = Vec::with_capacity(files.len());
    for f in files {
        decoded.push(match &f.put {
            Some(put) => Some(decode(&put.agg).ok_or_else(|| Error::from_reason(format!("the entry parsed for {} is not well formed", f.path)))?),
            None => None,
        });
    }
    // Most scans change nothing: that is seen without the write lock, and the stored results are summed
    if let Ok(tx) = store.read_transaction() {
        if let Ok(mut plan) = plan(&tx, combination, files) {
            if plan.quiet() {
                if let Ok(stored) = stored_results(&tx, &mut plan) {
                    if plan.seeds.is_empty() {
                        let mut sum = Sum::default();
                        for (g, result) in &stored {
                            sum.add(result, &places(plan.groups[*g].members.as_deref().unwrap_or_default()));
                        }
                        return Ok(Scanned::Summed { summed: sum.finish(), failure: None });
                    }
                }
            }
        }
    }
    // The write lock, held from the first read to the commit; without it, what the store holds is read and nothing is
    // written
    let (tx, writable, mut failure) = match store.write_transaction() {
        Ok(tx) => (tx, true, None),
        Err(why) => match store.read_transaction() {
            Ok(tx) => (tx, false, Some(why)),
            Err(_) => return unread(dates, files, Some(why)),
        },
    };
    let combined = match combine_planned(&tx, dates, combination, files, &decoded)? {
        Ok(combined) => combined,
        Err(Unread::Store(why)) => {
            drop(tx);
            return unread(dates, files, Some(why));
        }
        Err(Unread::Bad(bad)) => return Ok(Scanned::Bad { files: bad, failure: None }),
    };
    let mut sum = Sum::default();
    for (g, result) in &combined.stored {
        sum.add(result, &places(combined.plan.groups[*g].members.as_deref().unwrap_or_default()));
    }
    for (result, members, _) in &combined.new {
        sum.add(result, &places(members));
    }
    if writable {
        match write(&tx, combination, files, &decoded, &combined) {
            Ok(()) => match tx.commit() {
                Ok(()) => store.checkpoint(),
                Err(why) => failure = Some(why.to_string()),
            },
            // The transaction rolls back as it is dropped: none of it lands
            Err(why) => failure = Some(why),
        }
    }
    Ok(Scanned::Summed { summed: sum.finish(), failure })
}

fn places(members: &[usize]) -> Vec<u32> {
    members.iter().map(|&p| p as u32).collect()
}

/// Why a scan could not combine from the store
enum Unread {
    Store(String),
    Bad(Vec<String>),
}

/// What a scan combined: the stored results it keeps, each with its group, and the groups it combined again, each with
/// its members' places and its input
struct Combined {
    plan: Plan,
    stored: Vec<(usize, GroupResult)>,
    new: Vec<(GroupResult, Vec<usize>, Vec<u8>)>,
}

fn combine_planned(
    conn: &Connection,
    dates: &LocalDates<'_>,
    combination: &str,
    files: &[ScanFile],
    decoded: &[Option<(Facts, Vec<i64>)>],
) -> napi::Result<Result<Combined, Unread>> {
    let store_failed = |why: String| Ok(Err(Unread::Store(why)));
    let mut plan = match plan(conn, combination, files) {
        Ok(plan) => plan,
        Err(why) => return store_failed(why),
    };
    if !plan.bad.is_empty() {
        return Ok(Err(Unread::Bad(std::mem::take(&mut plan.bad))));
    }
    let mut stored = match stored_results(conn, &mut plan) {
        Ok(stored) => stored,
        Err(why) => return store_failed(why),
    };
    // The keys of a file this scan: a new entry's own, a held one's from the store
    let mut new_keys: HashMap<i64, Vec<usize>> = HashMap::new();
    for (p, d) in decoded.iter().enumerate() {
        for &key in d.iter().flat_map(|(_, keys)| keys) {
            new_keys.entry(key).or_default().push(p);
        }
    }
    let at_id: HashMap<i64, usize> = plan.ids.iter().enumerate().filter_map(|(p, id)| id.map(|id| (id, p))).collect();
    let mut cache: HashMap<usize, Vec<i64>> = HashMap::new();
    let keys_of = |p: usize, cache: &mut HashMap<usize, Vec<i64>>| -> Result<Vec<i64>, String> {
        if let Some(keys) = cache.get(&p) {
            return Ok(keys.clone());
        }
        let keys = match (&decoded[p], plan.ids[p]) {
            (Some((_, keys)), _) => keys.clone(),
            (None, Some(id)) => store::keys_of(conn, id)?,
            (None, None) => Vec::new(),
        };
        cache.insert(p, keys.clone());
        Ok(keys)
    };
    // The files combined again, with every group their keys now reach: a new entry's key can join groups that were apart
    let mut taken = vec![false; files.len()];
    let mut queue: Vec<usize> = plan.seeds.clone();
    queue.iter().for_each(|&p| taken[p] = true);
    // With every group combined again there is no group left to reach
    let clean = plan.groups.iter().any(|g| !g.dirty);
    while let Some(p) = queue.pop().filter(|_| clean) {
        let keys = match keys_of(p, &mut cache) {
            Ok(keys) => keys,
            Err(why) => return store_failed(why),
        };
        for key in keys {
            let held = match store::files_of(conn, key) {
                Ok(held) => held,
                Err(why) => return store_failed(why),
            };
            // A held file's stored keys, but for one with a new entry, whose new keys are its own
            let reached = held.iter().filter_map(|id| at_id.get(id).copied()).filter(|&q| decoded[q].is_none());
            for q in reached.chain(new_keys.get(&key).into_iter().flatten().copied()).collect::<Vec<_>>() {
                if taken[q] {
                    continue;
                }
                let joined: Vec<usize> = match plan.home[q] {
                    Some(g) if !plan.groups[g].dirty => {
                        plan.groups[g].dirty = true;
                        plan.groups[g].members.clone().unwrap_or_default()
                    }
                    _ => vec![q],
                };
                for r in joined {
                    if !taken[r] {
                        taken[r] = true;
                        queue.push(r);
                    }
                }
            }
        }
    }
    stored.retain(|(g, _)| !plan.groups[*g].dirty);
    let again: Vec<usize> = (0..files.len()).filter(|&p| taken[p]).collect();
    let groups = match components(&again, files.len(), |p| keys_of(p, &mut cache)) {
        Ok(groups) => groups,
        Err(why) => return store_failed(why),
    };
    let mut new = Vec::with_capacity(groups.len());
    let mut bad = Vec::new();
    for group in groups {
        // One group's entries at a time
        let mut aggs = Vec::with_capacity(group.len());
        for &p in &group {
            aggs.push(match (&files[p].put, plan.ids[p]) {
                (Some(put), _) => Some(put.agg.clone()),
                (None, Some(id)) => match store::agg(conn, id) {
                    Ok(agg) => agg,
                    Err(why) => return store_failed(why),
                },
                (None, None) => None,
            });
        }
        if let Some(i) = aggs.iter().position(Option::is_none) {
            bad.push(files[group[i]].path.clone());
            continue;
        }
        let members: Vec<_> =
            group.iter().zip(&aggs).map(|(&p, agg)| (agg.as_deref().unwrap_or(""), files[p].admitted, files[p].title.as_deref())).collect();
        match combine_group(dates, &members)? {
            Ok(result) => {
                let input = input(group.iter().map(|&p| (plan.revs[p], files[p].admitted, files[p].title.clone())));
                new.push((result, group, input));
            }
            Err(members) => bad.extend(members.into_iter().map(|m| files[group[m]].path.clone())),
        }
    }
    if !bad.is_empty() {
        return Ok(Err(Unread::Bad(bad)));
    }
    Ok(Ok(Combined { plan, stored, new }))
}

/// Writes what a scan changed, in its write transaction `tx`: the removals, the new entries with their keys, and the
/// groups combined again
fn write(tx: &Connection, combination: &str, files: &[ScanFile], decoded: &[Option<(Facts, Vec<i64>)>], combined: &Combined) -> Result<(), String> {
    let plan = &combined.plan;
    for &id in &plan.removes {
        store::remove(tx, id)?;
    }
    let mut ids = plan.ids.clone();
    for (p, f) in files.iter().enumerate() {
        if let (Some(put), Some((facts, keys))) = (&f.put, &decoded[p]) {
            let entry = store::Entry { put, facts: Some(facts.clone()), keys: keys.clone() };
            ids[p] = Some(store::put(tx, &entry, plan.revs[p])?);
        }
    }
    for group in plan.groups.iter().filter(|g| g.dirty) {
        store::drop_group(tx, group.id)?;
    }
    for (result, members, input) in &combined.new {
        let members: Vec<i64> = members.iter().map(|&p| ids[p].unwrap_or(0)).collect();
        store::add_group(tx, &members, input, combination, &result.encode())?;
    }
    Ok(())
}

/// A scan whose store could not be read: files with new entries alone can be combined, from memory; otherwise the files
/// the store was to give are the caller's to parse again
fn unread(dates: &LocalDates<'_>, files: &[ScanFile], failure: Option<String>) -> napi::Result<Scanned> {
    if files.iter().any(|f| f.put.is_none()) {
        return Ok(Scanned::Bad { files: files.iter().filter(|f| f.put.is_none()).map(|f| f.path.clone()).collect(), failure });
    }
    let entries: Vec<_> = files.iter().map(|f| (f.put.as_ref().map_or("", |p| p.agg.as_str()), f.admitted, f.title.as_deref())).collect();
    match combine_entries(dates, &entries)? {
        Ok(summed) => Ok(Scanned::Summed { summed, failure }),
        Err(bad) => Err(Error::from_reason(format!("the entry parsed for {} is not well formed", files[bad[0]].path))),
    }
}
