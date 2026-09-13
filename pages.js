// Configuration for the single book in this project. Filenames are kept
// exactly as sourced. Each entry in `pages` may carry a `number`, which is
// the page number overlaid at render time (in script.js) — the source JPGs
// are never modified. Entries without `number` render with no overlay.
window.BOOK = {
  title: "G.E. Shannon — Old B&W Photos",
  dir: "images",
  width: 4500,
  height: 3450,
  cover: "main-cover.jpg",
  endCover: "lastCover2.jpg",
  // Video that plays in place of the end-cover photo when clicked; path is
  // relative to the project root (not `dir`, since it lives outside images/).
  endCoverVideo: "video/dadGpDance.mp4",
  pages: [
    { file: "text pg 1.jpg" },
    {
      file: "text pg 2.jpg",
      // Single click-to-play video hotspot over the photo (not a
      // HOTSPOTS zoom entry, since this opens a video, not a photo
      // zoom); box is a fraction of the page image, same convention
      // as hotspots.js.
      video: "video/dadHorseBackflip.mp4",
      videoBox: { x: 0.5, y: 0.005, w: 0.4989, h: 0.99 }
    },
    { file: "p3.jpg", number: 3 },
    { file: "p4.jpg", number: 4 },
    { file: "p5.jpg", number: 5 },
    { file: "p6.jpg", number: 6 },
    { file: "p7.jpg", number: 7 },
    { file: "p8.jpg", number: 8 },
    { file: "p9.jpg", number: 9 },
    { file: "p10.jpg", number: 10 },
    { file: "p11.jpg", number: 11 },
    { file: "p12.jpg", number: 12 },
    { file: "p13.jpg", number: 13 },
    { file: "p14.jpg", number: 14 },
    { file: "p15.jpg", number: 15 },
    { file: "p16.jpg", number: 16 },
    { file: "p17.jpg", number: 17 },
    { file: "p18.jpg", number: 18 },
    { file: "p19.jpg", number: 19 },
    { file: "p20.jpg", number: 20 },
    { file: "p21.jpg", number: 21 },
    { file: "p22.jpg", number: 22 },
    { file: "p23.jpg", number: 23 },
    { file: "p24.jpg", number: 24 },
    { file: "p25.jpg", number: 25 },
    { file: "p26.jpg", number: 26 },
    { file: "p27.jpg", number: 27 },
    { file: "p28.jpg", number: 28 },
    { file: "p29.jpg", number: 29 },
    { file: "p30.jpg", number: 30 },
    { file: "p31.jpg", number: 31 }
  ]
};
