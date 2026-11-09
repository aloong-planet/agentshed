// Progressive enhancement: the poster is a working YouTube link without scripts. Only an unmodified
// activation replaces it with the player, so visiting the page sends no request to YouTube (REQ-009).
export function initHeroVideo(doc: Document = document): void {
  const play = doc.querySelector<HTMLAnchorElement>('.hero-video-play')
  if (!play) return
  play.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const frame = doc.createElement('iframe')
    const videoId = new URL(play.href).searchParams.get('v')
    frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`
    frame.title = play.dataset.videoTitle ?? ''
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
    frame.allowFullscreen = true
    // YouTube requires an HTTP Referer for embedded playback; preserve the site's origin.
    frame.referrerPolicy = 'strict-origin-when-cross-origin'
    play.replaceWith(frame)
    frame.focus()
  })
}
