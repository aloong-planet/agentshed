# Landing page

> Related decisions: [ADR-0031](../adr/0031-macos-release-line.md)

## Overview
People who have never seen the repository need a place that says what Agentshed is and lets them
download it. The landing page at `agentshed.aloongplanet.com` introduces the app, shows its main views,
explains the install, and always offers whichever release exists, without being changed for a release.

## Capabilities
- The page is in Chinese at `agentshed.aloongplanet.com` and in English at `/en`. The toggle at the right
  of the header switches between them and keeps the visitor where they were on the page
- The header stays at the top while scrolling: the app's icon and name, links to the Features, Install
  and Download sections and to GitHub (hidden on narrow screens), and the language toggle
- The hero shows the app icon, the README's opening line as its heading and its summary as the paragraph,
  the download button with "macOS 12 or later · Apple Silicon" beneath it, and a screenshot of the whole app
  window
- The download button offers the release that exists:
  - when a stable version exists, "Download Agentshed <version>" downloads its disk image directly, with
    a link to every version on GitHub beneath it
  - when only a test version exists, "Download test version <version>" leads to that version's page on
    GitHub, and the page says plainly that it is a test version and that no stable release exists yet
  - when the page cannot tell what exists (offline, for example), "Download Agentshed from GitHub" leads
    to the list of releases on GitHub
- Until the page has found out what exists it offers the list of releases, which is already a way to
  download. When the answer arrives, the buttons change in place; a visitor who has scrolled past the
  hero sees nothing move
- The download section at the end of the page makes the same offer: the current version with its
  download, the test version with its "Test version" pill, or a button to the list on GitHub
- The features section walks through six of the app's views — the overview, what each project has, what
  the agents remember, token usage and trends, sessions revisited, and search across projects — each with a
  screenshot. On a wide screen the section stays pinned under the header while the page scrolls past it,
  showing one step at a time: its count ("03 / 06"), title and text on the left, its screenshot large on the
  right. Scrolling on turns to the next step, the text and the screenshot fading in place together;
  scrolling back turns back. On a narrow screen, or with scripts turned off, each step's screenshot sits
  under its text
- The install section gives three steps: download the disk image for Apple Silicon, drag Agentshed into
  Applications, open it. It says that macOS will report Apple found no malicious software, that clicking
  Open is enough, and that an update button appears in the app when a new version comes out
- The page follows the visitor's light or dark appearance, in the app's colours; the screenshots stay light
- Links to GitHub open in a new tab; a direct download starts in place

## Boundaries and non-goals
- Chinese and English only
- One download only: the disk image for Macs with Apple Silicon on macOS 12 or later. There is no Intel,
  Windows or Linux download
- When a stable version exists, a newer test version is not offered on the page; it is reached through
  the link to every version on GitHub
- No release notes and no download counts are shown
- The feature steps turn with the scroll only; there is nothing to click between them
- The screenshots are real screenshots of the app; they change only when they are retaken
