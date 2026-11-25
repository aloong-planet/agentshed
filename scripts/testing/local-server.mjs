// Shared by the script tests that run against a local HTTP server: the release mirror's probe and the download count's
// watchdog.

/** Starts `server` on a free port of the loopback address and resolves to that port */
export const listening = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
