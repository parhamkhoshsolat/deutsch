/**
 * The measuring instrument for the design audit.
 *
 * Pasted into the running app, it scores whatever screen is on the display
 * against `docs/design-rubric.md`. Everything here is measured from the
 * rendered page rather than read off the stylesheet, because what matters is
 * what a token resolves to *in place*: a colour that is fine on a card and
 * unreadable on the coloured bar above it is one token and two results.
 *
 * It reports defects, not opinions. Every number it produces can be checked by
 * pointing at the element it names.
 */
window.__designAudit = () => {
  const CAPS = { targets: 4, contrast: 3, type: 5, layout: 4, rtl: 3, states: 3 }
  const POINTS = { targets: 20, contrast: 20, type: 15, layout: 15, rtl: 15, states: 15 }

  // --- colour -------------------------------------------------------------
  const channel = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const luminance = ([r, g, b]) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  const parse = (css) => {
    const m = css.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 }
  }
  /** The colour actually painted behind an element, walking up through transparency. */
  const behind = (el) => {
    let node = el
    while (node && node !== document.documentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor)
      if (bg && bg.a > 0.05) return bg.rgb
      node = node.parentElement
    }
    const body = parse(getComputedStyle(document.body).backgroundColor)
    return body ? body.rgb : [255, 255, 255]
  }
  const ratio = (a, b) => {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }

  // --- what counts as text -------------------------------------------------
  const textNodes = () => {
    const out = []
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      if (!n.textContent.trim()) continue
      const el = n.parentElement
      if (!el) continue
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      out.push(el)
    }
    return [...new Set(out)]
  }

  const interactive = () => [...document.querySelectorAll(
    'button, a[href], input, select, textarea, [role=button], [role=tab]')]
    .filter((el) => {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && el.type !== 'hidden'
    })

  const label = (el) => (el.getAttribute('aria-label')
    || el.textContent.trim().slice(0, 28) || el.tagName.toLowerCase())

  // --- the criteria --------------------------------------------------------
  const defects = { targets: [], contrast: [], type: [], layout: [], rtl: [], states: [] }

  for (const el of interactive()) {
    const r = el.getBoundingClientRect()
    if (r.width < 44 || r.height < 44) {
      defects.targets.push(
        `${label(el)} is ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
  }

  for (const el of textNodes()) {
    const s = getComputedStyle(el)
    const size = parseFloat(s.fontSize)
    const weight = Number(s.fontWeight) || 400
    const fg = parse(s.color)
    if (!fg) continue
    const need = size >= 24 || (weight >= 700 && size >= 18.66) ? 3 : 4.5
    const got = ratio(fg.rgb, behind(el))
    if (got < need) {
      defects.contrast.push(
        `"${el.textContent.trim().slice(0, 22)}" ${got.toFixed(2)}:1 needs ${need}:1 at ${size}px`)
    }
    if (size < 12.5) {
      defects.type.push(`"${el.textContent.trim().slice(0, 20)}" is ${size}px`)
    } else if (size < 15 && weight < 500) {
      defects.type.push(`"${el.textContent.trim().slice(0, 20)}" ${size}px at weight ${weight}`)
    }
  }

  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    defects.layout.push(
      `page scrolls sideways: ${document.documentElement.scrollWidth} > ${window.innerWidth}`)
  }
  // Overlap between things a finger has to hit separately.
  //
  // Only between elements in normal flow. A floating button and a tab bar are
  // *supposed* to sit over scrolling content — Layout says controls "appear on
  // top of content rather than on the same plane" — so counting that as a
  // defect measures the design working rather than failing. What is a defect
  // is two flow elements on top of each other, which is a broken layout.
  const flow = (el) => {
    // Walk up: a tab-bar button is `position: static` inside a `fixed` nav,
    // so checking the element alone calls the whole tab bar normal flow and
    // then reports every row of a scrolling list as overlapping it.
    let n = el
    while (n && n !== document.body) {
      const pos = getComputedStyle(n).position
      if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') return false
      n = n.parentElement
    }
    return true
  }
  const boxes = interactive().filter(flow).map((el) => [el, el.getBoundingClientRect()])
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [ea, a] = boxes[i]
      const [eb, b] = boxes[j]
      if (ea.contains(eb) || eb.contains(ea)) continue
      const over = !(a.right <= b.left || a.left >= b.right
        || a.bottom <= b.top || a.top >= b.bottom)
      if (over) defects.layout.push(`${label(ea)} overlaps ${label(eb)}`)
    }
  }


  // --- right-to-left -------------------------------------------------------
  //
  // The interface is Persian; the subject matter is German. Every screen is a
  // right-to-left page with left-to-right words inside it, which is the exact
  // situation the bidi algorithm gets wrong when nobody isolates the runs. The
  // three defects below are the three ways it actually goes wrong here.
  const ARABIC = /[؀-ۿ]/
  const LATIN = /[A-Za-zÀ-ɏ]/
  const WESTERN = /[0-9]/
  const own = (el) => [...el.childNodes]
    .filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')

  const rtlRoot = (el) => getComputedStyle(el).direction

  for (const el of textNodes()) {
    const text = own(el).trim()
    if (!text) continue
    const s = getComputedStyle(el)
    const inRtl = rtlRoot(el) === 'rtl'

    // A German word sitting loose in a Persian sentence. Without isolation the
    // bidi algorithm hands the punctuation at the run's edge to the wrong side,
    // so "der Tisch." renders as ".der Tisch".
    if (inRtl && ARABIC.test(text) && LATIN.test(text)
        && s.unicodeBidi === 'normal' && !el.getAttribute('dir')) {
      defects.rtl.push(`mixed script unisolated: "${text.slice(0, 24)}"`)
    }

    // Western digits in Persian running text. The app has digits() for this;
    // where it was not applied the number reads as a foreign body.
    const loose = text.replace(/[A-Za-z]\d+|\d+[A-Za-z]/g, '')
    if (inRtl && ARABIC.test(text) && WESTERN.test(loose)
        && !el.closest('.mono, .term, .ipa, .paradigm')) {
      defects.rtl.push(`western digits in Persian text: "${text.slice(0, 24)}"`)
    }

    // Physical alignment inside an RTL page. `start`/`end` follow the reader;
    // `left`/`right` do not, and mirror the layout the moment direction flips.
    if (inRtl && (s.textAlign === 'left' || s.textAlign === 'right')
        && text.length > 1) {
      defects.rtl.push(`text-align: ${s.textAlign} in RTL: "${text.slice(0, 20)}"`)
    }
  }

  // --- states --------------------------------------------------------------
  //
  // Not "does a spinner exist" but "can you tell what is happening". A control
  // with no name is a dead end for anyone not looking at the screen; a region
  // that renders nothing with nothing to say is a screen that looks broken.
  for (const el of interactive()) {
    const labelled = [...(el.labels || [])].map((l) => l.textContent).join(' ')
    const name = (el.getAttribute('aria-label') || el.getAttribute('title')
      || el.textContent.trim() || labelled || el.getAttribute('placeholder')
      || el.getAttribute('name') || '').trim()
    if (!name) defects.states.push(`unnamed control: <${el.tagName.toLowerCase()}>`)
  }
  for (const img of document.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) defects.states.push(`img with no alt: ${img.src.slice(-24)}`)
  }
  // An empty region that says nothing. A list with no rows must still say why.
  for (const el of document.querySelectorAll('.list, .rail, .grid, main, .lektion-body')) {
    const r = el.getBoundingClientRect()
    if (r.height < 4) continue
    if (!el.textContent.trim() && !el.querySelector('img, svg, canvas, input')) {
      defects.states.push(`empty region with no message: .${el.className || el.tagName}`)
    }
  }

  const dedupe = (xs) => [...new Set(xs)]
  for (const k of Object.keys(defects)) defects[k] = dedupe(defects[k])

  const score = (key, count) =>
    Math.round(POINTS[key] * (1 - Math.min(1, count / CAPS[key])) * 10) / 10

  return {
    screen: (document.querySelector('.whereami .act')?.textContent || '?').trim(),
    appearance: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    counts: Object.fromEntries(Object.entries(defects).map(([k, v]) => [k, v.length])),
    scores: {
      targets: score('targets', defects.targets.length),
      contrast: score('contrast', defects.contrast.length),
      type: score('type', defects.type.length),
      layout: score('layout', defects.layout.length),
      rtl: score('rtl', defects.rtl.length),
      states: score('states', defects.states.length),
    },
    total: Math.round(Object.keys(POINTS)
      .reduce((sum, k) => sum + POINTS[k] * (1 - Math.min(1, defects[k].length / CAPS[k])), 0) * 10) / 10,
    defects,
  }
}
