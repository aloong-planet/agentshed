// electron-builder's beforePack hook (electron-builder.yml): builds the engine module the package ships (ADR-0045)
// before the app is packed, for the architecture being packaged, so a package never carries a module left over from
// another build. scripts/build-engine.mjs builds it without the test-seams feature and refuses it when it exports a
// seam or reports another build than the app's code; electron-builder.yml's mac.extraResources then places it in the
// app's resources, outside the asar archive, where it is signed and notarised with the app.
//
// The module is built for the machine that packages: a package for another architecture fails here rather than
// shipping a module that will not load. macOS ships arm64 only (ADR-0031).
//
// The .cjs extension: the package is "type": "module", and electron-builder loads a hook with require().
const { Arch } = require('electron-builder')

exports.default = async function beforePack(context) {
  const arch = Arch[context.arch]
  if (context.electronPlatformName !== 'darwin') {
    throw new Error(`the engine module is packaged for macOS only, not ${context.electronPlatformName}`)
  }
  if (arch !== process.arch) {
    throw new Error(`the engine module is built for this machine's architecture (${process.arch}), not ${arch}`)
  }
  const { buildEngine } = await import('../scripts/build-engine.mjs')
  const library = buildEngine({ packaged: true })
  console.log(`[engine] packaged module built and checked: ${library}`)
}
