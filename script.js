(function () {
  "use strict";

  var config = window.BOOK;

  var HOTSPOTS = window.HOTSPOTS || {};

  var stageEl = document.getElementById("stage");
  var loadingEl = document.getElementById("loading");
  var appEl = document.getElementById("app");
  var prevBtn = document.getElementById("prev-btn");
  var nextBtn = document.getElementById("next-btn");
  var indicatorEl = document.getElementById("page-indicator");
  var titleEl = document.getElementById("title");
  var zoomOverlayEl = document.getElementById("zoom-overlay");
  var zoomFrameEl = document.getElementById("zoom-frame");

  document.title = config.title;
  titleEl.textContent = config.title;

  var PAGE_WIDTH = config.width;
  var PAGE_HEIGHT = config.height;
  var PAGE_RATIO = PAGE_WIDTH / PAGE_HEIGHT;

  // Page definitions: cover (no number, hard) -> content pages (numbered at
  // render time where the config supplies a `number`) -> end cover (no
  // number, hard, with an instructional overlay baked on top of the image
  // rather than as a separate generated page).
  var pageDefs = [];
  pageDefs.push({
    kind: "cover",
    src: config.dir + "/" + config.cover,
    alt: config.title + " cover"
  });
  config.pages.forEach(function (p) {
    pageDefs.push({
      kind: "content",
      src: config.dir + "/" + p.file,
      alt: config.title + " page " + (p.number || ""),
      number: p.number,
      file: p.file
    });
  });
  pageDefs.push({
    kind: "endcover",
    src: config.dir + "/" + config.endCover,
    alt: config.title + " back cover",
    videoSrc: config.endCoverVideo
  });

  var TOTAL_PAGES = pageDefs.length;
  var LAST_INDEX = TOTAL_PAGES - 1;

  var pageFlip = null;
  var lastLayout = null;
  var resizeTimer = null;
  var exited = false;
  var zoomOpen = false;
  var zoomBox = null;

  // Fit a box (fraction of the full page image) into the viewport, preserving
  // its true aspect ratio, then use it to crop that exact region out of the
  // full page image via background-size/background-position (no separate
  // cropped image files exist, so this is a CSS-only crop of the page scan).
  function positionZoomFrame(box) {
    var boxRatio = (box.w * PAGE_WIDTH) / (box.h * PAGE_HEIGHT);
    var availW = window.innerWidth;
    var availH = window.innerHeight;
    var totalW, totalH;
    if (availW / availH > boxRatio) {
      totalH = availH;
      totalW = totalH * boxRatio;
    } else {
      totalW = availW;
      totalH = totalW / boxRatio;
    }
    zoomFrameEl.style.width = Math.round(totalW) + "px";
    zoomFrameEl.style.height = Math.round(totalH) + "px";
    zoomFrameEl.style.backgroundSize = 100 / box.w + "% " + 100 / box.h + "%";
    zoomFrameEl.style.backgroundPosition =
      (box.w >= 1 ? 0 : (100 * box.x) / (1 - box.w)) + "% " +
      (box.h >= 1 ? 0 : (100 * box.y) / (1 - box.h)) + "%";
  }

  function openZoom(src, box) {
    zoomBox = box;
    zoomFrameEl.style.backgroundImage = "url(" + src + ")";
    positionZoomFrame(box);
    zoomOverlayEl.classList.add("visible");
    zoomOverlayEl.setAttribute("aria-hidden", "false");
    zoomOpen = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }

  function closeZoom() {
    zoomOpen = false;
    zoomBox = null;
    zoomOverlayEl.classList.remove("visible");
    zoomOverlayEl.setAttribute("aria-hidden", "true");
    updateIndicator();
  }

  // Compute the largest single-page box that fits inside #stage's available
  // space without exceeding it in either dimension, while preserving the
  // book's true page aspect ratio (no cropping, no stretching). Pages are
  // shown one at a time; there is never a two-page spread.
  function computeLayout() {
    var cs = getComputedStyle(stageEl);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    var padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    var availW = Math.max(stageEl.clientWidth - padX, 50);
    var availH = Math.max(stageEl.clientHeight - padY, 50);

    var totalW, totalH;
    if (availW / availH > PAGE_RATIO) {
      totalH = availH;
      totalW = totalH * PAGE_RATIO;
    } else {
      totalW = availW;
      totalH = totalW / PAGE_RATIO;
    }

    return {
      pageWidth: Math.max(180, Math.round(totalW)),
      pageHeight: Math.max(130, Math.round(totalH)),
      totalWidth: Math.round(totalW),
      totalHeight: Math.round(totalH)
    };
  }

  function buildPageEl(def) {
    var div = document.createElement("div");

    if (def.kind === "cover") {
      div.className = "page";
      div.setAttribute("data-density", "hard");
      var coverSurface = document.createElement("div");
      coverSurface.className = "page-surface";
      var coverImg = document.createElement("img");
      coverImg.src = def.src;
      coverImg.alt = def.alt;
      coverImg.draggable = false;
      coverSurface.appendChild(coverImg);
      div.appendChild(coverSurface);
    } else if (def.kind === "content") {
      div.className = "page";
      var surface = document.createElement("div");
      surface.className = "page-surface";
      var img = document.createElement("img");
      img.src = def.src;
      img.alt = def.alt;
      img.draggable = false;
      surface.appendChild(img);
      if (def.number) {
        var num = document.createElement("div");
        num.className = "page-number";
        num.textContent = String(def.number);
        surface.appendChild(num);
      }
      (HOTSPOTS[def.file] || []).forEach(function (box) {
        var hotspot = document.createElement("div");
        hotspot.className = "hotspot";
        hotspot.style.left = box.x * 100 + "%";
        hotspot.style.top = box.y * 100 + "%";
        hotspot.style.width = box.w * 100 + "%";
        hotspot.style.height = box.h * 100 + "%";
        hotspot.setAttribute("role", "button");
        hotspot.setAttribute("aria-label", "View photo full-page");
        var blockFlipGesture = function (e) {
          e.stopPropagation();
        };
        hotspot.addEventListener("mousedown", blockFlipGesture);
        hotspot.addEventListener("touchstart", blockFlipGesture, { passive: true });
        hotspot.addEventListener("click", function (e) {
          e.stopPropagation();
          openZoom(def.src, box);
        });
        surface.appendChild(hotspot);
      });
      div.appendChild(surface);
    } else if (def.kind === "endcover") {
      div.className = "page";
      div.setAttribute("data-density", "hard");
      var endSurface = document.createElement("div");
      endSurface.className = "page-surface end-surface";
      var endImg = document.createElement("img");
      endImg.src = def.src;
      endImg.alt = def.alt;
      endImg.draggable = false;
      endSurface.appendChild(endImg);

      if (def.videoSrc) {
        var endVideo = document.createElement("video");
        endVideo.className = "end-video end-hidden";
        endVideo.src = def.videoSrc;
        endVideo.loop = true;
        endVideo.muted = true;
        endVideo.autoplay = true;
        endVideo.playsInline = true;
        endSurface.appendChild(endVideo);

        var playHint = document.createElement("div");
        playHint.className = "play-hint";
        playHint.textContent = "▶";
        endSurface.appendChild(playHint);

        endImg.classList.add("clickable-photo");
        endImg.setAttribute("role", "button");
        endImg.setAttribute("aria-label", "Play video");
        var blockFlipGesture = function (e) {
          e.stopPropagation();
        };
        endImg.addEventListener("mousedown", blockFlipGesture);
        endImg.addEventListener("touchstart", blockFlipGesture, { passive: true });
        endImg.addEventListener("click", function (e) {
          e.stopPropagation();
          endImg.classList.add("end-hidden");
          playHint.classList.add("end-hidden");
          endVideo.classList.remove("end-hidden");
          endVideo.play().catch(function () {
            /* ignore: muted autoplay is expected to succeed in all modern browsers */
          });
        });
      } else {
        // No video configured for this book: fall back to the original
        // click-anywhere-to-exit affordance for the end cover.
        div.addEventListener("click", exitBook);
      }

      var note = document.createElement("div");
      note.className = "end-note";
      note.textContent = "Flip forward once more to exit, or flip back to return to the previous page.";
      endSurface.appendChild(note);
      div.appendChild(endSurface);
    }

    return div;
  }

  function exitBook() {
    if (exited) return;
    exited = true;
    document.removeEventListener("keydown", handleKeydown);
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    appEl.classList.add("exiting");
    setTimeout(function () {
      try {
        window.close();
      } catch (e) {
        /* ignore: not all browsers allow scripted tabs to close themselves */
      }
    }, 850);
  }

  function updateIndicator() {
    if (!pageFlip || exited || zoomOpen) return;
    var current = pageFlip.getCurrentPageIndex() + 1;
    indicatorEl.textContent = current + " / " + TOTAL_PAGES;
    prevBtn.disabled = pageFlip.getCurrentPageIndex() <= 0;
    nextBtn.disabled = false;
  }

  function goNext() {
    if (!pageFlip || exited || zoomOpen) return;
    if (pageFlip.getCurrentPageIndex() >= LAST_INDEX) {
      exitBook();
      return;
    }
    pageFlip.flipNext();
  }

  function goPrev() {
    if (!pageFlip || exited || zoomOpen) return;
    if (pageFlip.getCurrentPageIndex() <= 0) {
      // Already at (or somehow before) the cover: explicitly land back on
      // the start rather than relying on an implicit no-op, so "prior" from
      // the cover always resolves to a known, valid page.
      pageFlip.turnToPage(0);
      return;
    }
    pageFlip.flipPrev();
  }

  function mount(layout, restoreIndex) {
    if (pageFlip) {
      try {
        pageFlip.destroy();
      } catch (e) {
        /* ignore */
      }
      pageFlip = null;
    }

    var oldBook = document.getElementById("book");
    if (oldBook && oldBook.parentNode) {
      oldBook.parentNode.removeChild(oldBook);
    }

    var bookEl = document.createElement("div");
    bookEl.id = "book";
    bookEl.style.width = layout.totalWidth + "px";
    bookEl.style.height = layout.totalHeight + "px";
    stageEl.insertBefore(bookEl, prevBtn);

    pageDefs.forEach(function (def) {
      bookEl.appendChild(buildPageEl(def));
    });

    pageFlip = new St.PageFlip(bookEl, {
      width: layout.pageWidth,
      height: layout.pageHeight,
      size: "fixed",
      minWidth: layout.pageWidth,
      maxWidth: layout.pageWidth,
      minHeight: layout.pageHeight,
      maxHeight: layout.pageHeight,
      maxShadowOpacity: 0.5,
      showCover: true,
      mobileScrollSupport: false,
      usePortrait: true,
      autoSize: false,
      clickEventForward: true,
      useMouseEvents: true,
      swipeDistance: 20,
      flippingTime: 700,
      drawShadow: true
    });

    pageFlip.loadFromHTML(bookEl.querySelectorAll(".page"));

    pageFlip.on("init", function () {
      if (restoreIndex > 0) {
        pageFlip.turnToPage(restoreIndex);
      }
      updateIndicator();
      loadingEl.classList.add("hidden");
    });

    pageFlip.on("flip", updateIndicator);
    pageFlip.on("changeState", updateIndicator);
  }

  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var layout = computeLayout();
      if (
        lastLayout &&
        lastLayout.pageWidth === layout.pageWidth &&
        lastLayout.pageHeight === layout.pageHeight
      ) {
        return;
      }
      lastLayout = layout;
      var idx = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
      mount(layout, idx);
    }, 150);
  }

  function handleKeydown(e) {
    if (!pageFlip || exited || zoomOpen) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      goNext();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      goPrev();
    } else if (e.key === "Home") {
      pageFlip.turnToPage(0);
    } else if (e.key === "End") {
      pageFlip.turnToPage(LAST_INDEX);
    }
  }

  lastLayout = computeLayout();
  mount(lastLayout, 0);

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);
  window.addEventListener("resize", function () {
    if (zoomOpen && zoomBox) positionZoomFrame(zoomBox);
  });

  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);
  document.addEventListener("keydown", handleKeydown);
  zoomOverlayEl.addEventListener("click", closeZoom);
})();
