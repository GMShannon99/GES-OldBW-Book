# G.E. Shannon — Old B&W Photos

A page-flip viewer for a single scanned photo book, built with
[StPageFlip](https://github.com/Nodlik/StPageFlip) (same engine as the
[GilsArtBooks-Web](https://github.com/GMShannon99/GilsArtBooks-Web)
project). Click or drag a page corner, or use the arrow keys, to turn
pages. Every page displays one at a time, scaled to fit without
cropping or distortion.

## Structure

- `book.html` &mdash; the viewer shell and the app's entry point. There
  is only one book, so there's no menu/index page.
- `pages.js` &mdash; the book's configuration: title, page order, and
  source image dimensions.
- `script.js` &mdash; initializes StPageFlip from `pages.js` and
  overlays page numbers, photo hotspots, and the end-of-book note at
  render time; the source JPGs are never modified.
- `hotspots.js` &mdash; per-page bounding boxes (as fractions of the
  page image) for the clickable photo hotspots on the collage pages.
- `images/` &mdash; the source JPGs, copied in unmodified, under their
  original filenames (spaces and all, except the cover &mdash; see
  below).
- `video/` &mdash; video assets played from within the book (currently
  just the end-cover video).
- `vendor/page-flip.browser.js` &mdash; the StPageFlip library, vendored
  locally.

## Page order

1. Cover &mdash; `main-cover.jpg` (renamed from the sourced `main
   cover.jpg` to avoid a space in a filename referenced from CSS/JS)
2. `text pg 1.jpg`, `text pg 2.jpg` &mdash; unnumbered intro pages
3. `p3.jpg` through `p31.jpg` &mdash; numbered pages (the overlaid page
   number matches the number in the filename, e.g. `p17.jpg` shows
   "17")
4. `lastCover2.jpg` &mdash; the back cover, with an instructional note
   overlaid at the top and a click-to-play video (see below)

## End-of-book behavior

There's no menu to return to, so the back cover doubles as the exit
page instead of a generated "next" page: a semi-transparent strip
overlaid at the top of `lastCover2.jpg` reads "Flip forward once more
to exit, or flip back to return to the previous page." Using the Next
button or pressing the right arrow key while on it fades the viewer to
a blank screen and attempts to close the tab (browsers only allow
scripted tabs to close themselves, so the fade is the reliable part of
the exit on tabs not opened by script). Flipping backward from the
back cover returns to `p31` normally.

Pressing the Previous button (or the left arrow key) on the front
cover explicitly turns back to page 0 (the cover itself) rather than
relying on an implicit no-op, so "prior" from the cover always
resolves to a known, valid page instead of drifting into an undefined
state.

## End-cover video

Clicking the photo on `lastCover2.jpg` swaps it for an HTML5 `<video>`
(`video/dadGpDance.mp4`) that autoplays muted and loops continuously;
a small play-icon hint overlays the photo before it's clicked. This
replaces the old click-anywhere-to-exit affordance on that page &mdash;
exiting now happens only via the Next button, the right arrow key, or
an attempted forward flip. (If a book has no `endCoverVideo`
configured in `pages.js`, the end cover falls back to the original
click-anywhere-to-exit behavior.)

## Photo hotspots

Pages 3&ndash;14, 16&ndash;24, and 25&ndash;28 are scrapbook-style
collages of several individually mounted photos, so each photo on
those pages is a clickable hotspot (cursor changes to a zoom-in icon
on hover). Clicking a photo opens it full-page &mdash; cropped from the
existing page scan via CSS `background-size`/`background-position` (no
separate per-photo image files exist), scaled to fill the viewport
without distortion, same as any other page. Clicking the zoomed photo
again closes it and returns to the exact page it came from. While
zoomed, arrow-key navigation and the prev/next buttons are disabled so
the book underneath can't be flipped accidentally. Hotspots stop their
click/touch events from reaching StPageFlip, so they don't interfere
with dragging a page corner elsewhere on the same page.

Page 2 (`text pg 2.jpg`) is excluded even though it falls inside the
requested range: it's mostly memoir text plus a single photo, not a
multi-photo collage. Page 15 and pages 29&ndash;31 were left out of
scope entirely (not evaluated).

## Local preview

Serve the folder over HTTP (needed for the flipbook's image loading)
and open `book.html`, e.g.:

```
npx serve .
```
