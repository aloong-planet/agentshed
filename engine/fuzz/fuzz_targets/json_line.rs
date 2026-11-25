//! A line of any bytes, read by `agentshed_engine::fuzzing::json_line` (which names the engine module's reads it
//! makes): a panic, which would fail the read of the file that holds the line (token-stats A8), fails the run.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|bytes: &[u8]| agentshed_engine::fuzzing::json_line(bytes));
