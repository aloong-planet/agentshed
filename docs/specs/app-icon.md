# Application icon

> Related: [feature](../features/app-icon.md)

## Problem Statement

Agentshed needs an application identity that is recognisable in macOS and distinguishes a development
run from the production app.

## Solution

Use the approved reactor design: a graphite rounded square, six luminous segments separated by metal
supports, and a filled core with a smooth, centred radial gradient. Production is icy cyan;
development is golden yellow.

## Functional Requirements

### app-icon::REQ-001 Production identity (direct acceptance)

The packaged macOS application displays the approved cyan icon in Finder and the Dock.

### app-icon::REQ-002 Development identity (direct acceptance)

An unpackaged macOS development run displays the approved yellow icon in the Dock.

### app-icon::REQ-003 Approved artwork

- app-icon::REQ-003/AC-01: Both variants retain the approved graphite casing and six metal-separated
  luminous segments; the development variant has no corner indicator or text badge.
- app-icon::REQ-003/AC-02: The filled core matches the surrounding segments' hue and soft lighting,
  with the brightest point at the centre and an even radial transition toward its circumference.
- app-icon::REQ-003/AC-03: The icon has a transparent exterior, without the preview's checkerboard or
  name label, and remains recognisable at normal Dock sizes.

## Constraints

### app-icon::CON-001 Application identity only (direct acceptance)

This change does not replace renderer control icons, change theme preferences, rename the application,
or change its existing data location or single-instance behaviour.

## Failure modes and boundaries

- Build and open the packaged app: app-icon::REQ-001 applies before and after launch; development
  artwork must not override its bundle icon.
- Start development from the repository or from another working directory: app-icon::REQ-002 applies;
  asset resolution must not depend on the shell's current directory.
- Quit and relaunch either form: its icon remains the corresponding variant
  (app-icon::REQ-001 and app-icon::REQ-002).
- Change the UI theme or system appearance: the approved fixed branding remains unchanged
  (app-icon::REQ-003 and app-icon::CON-001).
- Missing or unreadable development artwork: retain Electron's fallback icon and allow the app to
  open. The packager may fall back when production artwork is missing, so a successful packaging
  command alone does not satisfy app-icon::REQ-001; verify the actual native bundle icon.
- Quiet test launches must remain hidden; setting an icon must not show the Dock or activate a window.
- The shipped assets are local images, without navigation, scripts, remote loading or user inputs.

## Implementation Decisions

The macOS bundle owns the production icon. Only an unpackaged macOS process sets the development
Dock icon after application readiness. Supply a multi-resolution native icon for packaging and a PNG
for development. The raster application identity is separate from ADR-0018's renderer control SVGs.

## Testing Decisions

This is asset/configuration integration, so skip unit-level TDD that would only mirror a setter.
Validate actual PNG alpha, inspect rendered small and large assets, decode the generated native icon,
and inspect a fresh packaged app's icon declaration and resource. Exercise a real unpackaged Electron
startup with isolated data and run the existing full verification gate. Record any system UI evidence
that cannot be obtained; resource presence alone does not prove the Dock appearance.

## Out of Scope

New distribution channels, a separately packaged development installer, signing/notarisation changes,
Windows/Linux icon support, theme-dependent branding and renderer layout changes.
