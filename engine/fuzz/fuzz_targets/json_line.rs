//! A line of any bytes, read every way the engine module reads one (`agentshed_engine::fuzzing::json_line`): a panic,
//! which would fail the read of the file that holds the line (token-stats A8), fails the run.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|bytes: &[u8]| agentshed_engine::fuzzing::json_line(bytes));
