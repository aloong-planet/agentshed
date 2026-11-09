// The landing-page media activation on fresh built HTML. JSDOM does not load the iframe: actual YouTube
// playback, network timing, mobile geometry and keyboard activation are checked in a browser.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { expect, inject, test } from 'vitest'
import { initHeroVideo } from '../src/scripts/hero-video'

const outDir = inject('builtSite')

test.each(['en', 'zh'] as const)('%s: the walkthrough loads only when its poster is activated', (locale) => {
  const dom = new JSDOM(readFileSync(join(outDir, locale === 'en' ? 'en/index.html' : 'index.html'), 'utf8'))
  const doc = dom.window.document
  initHeroVideo(doc)
  expect(doc.querySelector('iframe')).toBeNull()
  const play = doc.querySelector<HTMLAnchorElement>('.hero-video-play')
  if (locale === 'zh') {
    expect(play).toBeNull()
    expect(doc.querySelector('.hero .shot img')?.getAttribute('src')).toBe('/shots/hero-zh.png')
  } else {
    expect(play).not.toBeNull()
    const modified = new dom.window.MouseEvent('click', { ctrlKey: true, cancelable: true })
    // Prevent JSDOM from attempting navigation, after observing whether our handler allowed it.
    let intercepted = true
    play!.addEventListener('click', (event) => { intercepted = event.defaultPrevented; event.preventDefault() }, { once: true })
    play!.dispatchEvent(modified)
    expect(intercepted).toBe(false)
    expect(doc.querySelector('iframe')).toBeNull()
    play!.click()
    const frames = doc.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    expect(frames[0].src).toBe('https://www.youtube-nocookie.com/embed/lQ-Bg8nXJKM?autoplay=1&playsinline=1&rel=0')
    expect(frames[0].title).toBe('Agentshed product walkthrough')
    expect(frames[0].allow).toContain('autoplay')
    expect(frames[0].allowFullscreen).toBe(true)
    expect(frames[0].referrerPolicy).toBe('strict-origin-when-cross-origin')
    expect(doc.activeElement).toBe(frames[0])
    expect(doc.querySelector('.hero-video-play')).toBeNull()
    expect(doc.querySelector('.hero-video-fallback')?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=lQ-Bg8nXJKM')
  }
  dom.window.close()
})
