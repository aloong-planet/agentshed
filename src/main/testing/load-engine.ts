// vitest's setup for every test file (vitest.config.ts): the test's thread loads the engine module the tests use
// (ADR-0046), as every thread of the app loads it before it parses, so a parse the test runs on its own thread reaches
// the module (`runParseJob`). A test that loads a module that will not load, or one of another build, leaves this one
// the thread's module. The renderer's tests run under jsdom, where a module's URL is no file URL and nothing parses:
// they load nothing.
export {}

if (typeof window === 'undefined') {
  const { loadEngineModule } = await import('../engine-module')
  const { TEST_ENGINE } = await import('./engine')
  loadEngineModule(TEST_ENGINE)
}
