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
  overlays page numbers (and the end-of-book note) at render time; the
  source JPGs are never modified.
- `images/` &mdash; the source JPGs, copied in unmodified, under their
  original filenames.
- `vendor/page-flip.browser.js` &mdash; the StPageFlip library, vendored
  locally.

## Page order

1. Cover &mdash; `main cover.jpg`
2. `text pg 1.jpg`, `text pg 2.jpg` &mdash; unnumbered intro pages
3. `p3.jpg` through `p31.jpg` &mdash; numbered pages (the overlaid page
   number matches the number in the filename, e.g. `p17.jpg` shows
   "17")
4. `last cover.jpg` &mdash; the back cover, with an instructional note
   overlaid at the top

## End-of-book behavior

There's no menu to return to, so the back cover doubles as the exit
page instead of a generated "next" page: a semi-transparent strip
overlaid at the top of `last cover.jpg` reads "Flip forward once more
to exit, or flip back to return to the previous page." Clicking that
page, using the Next button, or pressing the right arrow key while on
it fades the viewer to a blank screen and attempts to close the tab
(browsers only allow scripted tabs to close themselves, so the fade is
the reliable part of the exit on tabs not opened by script). Flipping
backward from the back cover returns to `p31` normally, and there's no
way to flip backward past the front cover.

## Local preview

Serve the folder over HTTP (needed for the flipbook's image loading)
and open `book.html`, e.g.:

```
npx serve .
```
