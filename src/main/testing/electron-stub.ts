// What `electron` resolves to under vitest (vitest.config.ts aliases it here). Empty on purpose.
//
// Unit tests run in plain Node, where the real `electron` package exports only the path of its
// executable: every named import (`shell`, `app`, `protocol`, …) is `undefined` there anyway. Loading it
// buys nothing and costs a download — electron fetches its binary on the first `require`, and when several
// test workers did that at once in a fresh checkout they unpacked into the same directory and one test
// file failed to load. With this stub a named import is still `undefined`, so tests see exactly what they
// saw before; only the download is gone. Real Electron behaviour is exercised by e2e, which launches the
// real binary and never reads the vitest config.
export {}
