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
  var videoOverlayEl = document.getElementById("video-overlay");
  var videoFrameEl = document.getElementById("video-frame");
  var printBtn = document.getElementById("print-btn");
  var printFrameEl = document.getElementById("print-frame");
  var printStatusEl = document.getElementById("print-status");
  var currentPrintBlob = null;
  var printStatusTimer = null;

  // Visible, on-screen confirmation of each step of a print/share attempt -
  // added because window.print()'s mobile behavior is inconsistent enough
  // (silent no-ops on some Android builds and in standalone/home-screen
  // mode) that console logs alone aren't enough to diagnose from a phone
  // that isn't attached to a debugger. Safe to remove once mobile behavior
  // is confirmed working end to end.
  function showPrintStatus(msg) {
    console.log("[print]", msg);
    printStatusEl.textContent = msg;
    printStatusEl.classList.add("visible");
    clearTimeout(printStatusTimer);
    printStatusTimer = setTimeout(function () {
      printStatusEl.classList.remove("visible");
    }, 4000);
  }

  // Feature-detects whether navigator.share() can share an image file (Web
  // Share API level 2).
  function canShareFiles() {
    if (!window.navigator || !navigator.share || !navigator.canShare) return false;
    try {
      var probe = new File([new Blob(["x"], { type: "image/jpeg" })], "probe.jpg", {
        type: "image/jpeg"
      });
      return navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }

  // Desktop Chrome/Edge on Windows also implements navigator.share() (it
  // opens the Windows Share flyout), but that flyout has no "Print" entry
  // and would silently replace the desktop print flow that's already known
  // to work with a worse one. So the share-first path is gated to actual
  // mobile devices, not just feature support.
  function isMobileDevice() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
      return navigator.userAgentData.mobile;
    }
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
    // iPadOS Safari reports a desktop Mac user agent by default; tell it
    // apart from a real Mac by touch support (Macs aren't multi-touch).
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  var SHARE_CAPABLE = isMobileDevice() && canShareFiles();

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
      file: p.file,
      videoSrc: p.video,
      videoBox: p.videoBox
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

  // Renders the same box crop used on screen (via background-size/position)
  // into an offscreen canvas instead, so it can be printed as a real <img>.
  // Browsers print background images only if the user opts in via the print
  // dialog's "Background graphics" toggle (off by default in Chrome,
  // Firefox, and Safari), so printing the on-screen zoom-frame directly
  // would silently come out blank for most people.
  function preparePrintImage(src, box, onReady) {
    var img = new Image();
    img.onload = function () {
      var sx = Math.round(img.naturalWidth * box.x);
      var sy = Math.round(img.naturalHeight * box.y);
      var sw = Math.round(img.naturalWidth * box.w);
      var sh = Math.round(img.naturalHeight * box.h);
      var canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.toBlob(
        function (blob) {
          onReady(canvas.toDataURL("image/jpeg", 0.92), blob);
        },
        "image/jpeg",
        0.92
      );
    };
    img.src = src;
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
    printBtn.disabled = true;
    preparePrintImage(src, box, function (dataUrl, blob) {
      printFrameEl.src = dataUrl;
      currentPrintBlob = blob;
      printBtn.disabled = false;
    });
  }

  // Opens a local video in the same full-screen overlay pattern used for
  // photo hotspots (openZoom/closeZoom above): click to open, click the
  // overlay to close and return to the page underneath. No prior/next
  // navigation is involved - goPrev/goNext/handleKeydown are already gated
  // on zoomOpen below, so they're simply no-ops while either overlay is up.
  //
  // The video element has no `autoplay` attribute and no `src` until this
  // runs, so it never starts on its own; `muted` is set fresh on each call
  // since different videos in the book want different defaults (e.g. the
  // end-cover video plays with sound, page hotspot videos play muted).
  // play() is called here, synchronously inside the click handler that led
  // here, which is what lets the browser play it (a direct user gesture)
  // instead of being blocked as an autoplay attempt.
  function openVideoZoom(src, muted) {
    videoFrameEl.muted = !!muted;
    videoFrameEl.src = src;
    videoOverlayEl.classList.add("visible");
    videoOverlayEl.setAttribute("aria-hidden", "false");
    zoomOpen = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    videoFrameEl.play().catch(function () {
      /* ignore: some browsers may still reject programmatic play() in edge
         cases (e.g. a slow/failed load); there's no fallback UI to show, so
         the overlay just sits there with the video's native controls absent */
    });
  }

  function closeZoom() {
    zoomOpen = false;
    zoomBox = null;
    zoomOverlayEl.classList.remove("visible");
    zoomOverlayEl.setAttribute("aria-hidden", "true");
    videoOverlayEl.classList.remove("visible");
    videoOverlayEl.setAttribute("aria-hidden", "true");
    videoFrameEl.pause();
    videoFrameEl.currentTime = 0;
    printBtn.disabled = true;
    printFrameEl.removeAttribute("src");
    currentPrintBlob = null;
    printStatusEl.classList.remove("visible");
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
      if (def.videoSrc && def.videoBox) {
        // Same click-to-open pattern as the end-cover video (openVideoZoom/
        // closeZoom): a single hotspot-shaped click target over the photo,
        // muted and looping (loop is set on #video-frame in book.html).
        var videoHotspot = document.createElement("div");
        videoHotspot.className = "hotspot video-hotspot";
        videoHotspot.style.left = def.videoBox.x * 100 + "%";
        videoHotspot.style.top = def.videoBox.y * 100 + "%";
        videoHotspot.style.width = def.videoBox.w * 100 + "%";
        videoHotspot.style.height = def.videoBox.h * 100 + "%";
        videoHotspot.setAttribute("role", "button");
        videoHotspot.setAttribute("aria-label", "Play video");
        var blockVideoFlipGesture = function (e) {
          e.stopPropagation();
        };
        videoHotspot.addEventListener("mousedown", blockVideoFlipGesture);
        videoHotspot.addEventListener("touchstart", blockVideoFlipGesture, { passive: true });
        videoHotspot.addEventListener("click", function (e) {
          e.stopPropagation();
          openVideoZoom(def.videoSrc, true);
        });
        surface.appendChild(videoHotspot);
      }
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
        // Same click-to-open pattern as the content-page hotspots: clicking
        // the photo opens the video full-page; clicking the video (the
        // overlay) closes it and returns to this same lastCover2 page.
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
          openVideoZoom(def.videoSrc, false);
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
      window.location.href = "https://gmshannon99.github.io/MySelectMenu/";
    }, 850);
  }

  // Kept distinct from exitBook() only for the "exited" no-op guard call
  // sites; both now send the user back to the same place - the
  // MySelectMenu launcher this book was opened from.
  function returnToMenu() {
    if (exited) return;
    exited = true;
    document.removeEventListener("keydown", handleKeydown);
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    appEl.classList.add("exiting");
    setTimeout(function () {
      window.location.href = "https://gmshannon99.github.io/MySelectMenu/";
    }, 850);
  }

  function updateIndicator() {
    if (!pageFlip || exited || zoomOpen) return;
    var current = pageFlip.getCurrentPageIndex() + 1;
    indicatorEl.textContent = current + " / " + TOTAL_PAGES;
    // Both buttons stay enabled at every index: at the boundaries they now
    // trigger exit (via goPrev/goNext) rather than being dead ends.
    prevBtn.disabled = false;
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
      // Already at (or somehow before) the cover: hand control back to
      // MySelectMenu, the launcher this book was opened from, rather than
      // looping on the cover.
      returnToMenu();
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
  videoOverlayEl.addEventListener("click", closeZoom);
  // Confirms window.print() actually opened/closed a dialog, as opposed to
  // the call silently no-op'ing (which happens in some Android WebViews and
  // in some "added to home screen" standalone contexts with no browser
  // chrome to host the print UI).
  window.addEventListener("beforeprint", function () {
    showPrintStatus("Print dialog opened.");
  });
  window.addEventListener("afterprint", function () {
    showPrintStatus("Print dialog closed.");
  });

  printBtn.addEventListener("click", function (e) {
    // Stop the click from bubbling to zoomOverlayEl's own listener, which
    // would otherwise treat this click as "close the zoom" (same pattern
    // used for the photo hotspots themselves).
    e.stopPropagation();
    showPrintStatus("Tap registered…");

    // Prefer the share sheet where it can actually share a file: far more
    // reliable on mobile (Save Image / AirPrint / send-to-printer-app all
    // live there) than window.print(), whose in-page print support is
    // inconsistent across Android builds and doesn't work at all inside
    // browser chrome-less contexts. Both calls happen synchronously inside
    // this click handler (not after an await or a timeout) because both
    // require an active user gesture to be allowed to run at all.
    if (SHARE_CAPABLE && currentPrintBlob) {
      try {
        var file = new File([currentPrintBlob], "photo.jpg", { type: "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          showPrintStatus("Opening share sheet…");
          navigator
            .share({ files: [file], title: config.title })
            .then(function () {
              showPrintStatus("Shared.");
            })
            .catch(function (err) {
              if (err && err.name === "AbortError") {
                // The user dismissed the share sheet themselves - not a failure.
                showPrintStatus("Share cancelled.");
              } else {
                console.error("[print] share failed, falling back to print", err);
                showPrintStatus("Share failed, trying print…");
                window.print();
              }
            });
          return;
        }
      } catch (err) {
        // Fall through to window.print() below rather than aborting silently.
        console.error("[print] share setup threw, falling back to print", err);
      }
    }

    showPrintStatus("Opening print dialog…");
    try {
      window.print();
    } catch (err) {
      console.error("[print] window.print() threw", err);
      showPrintStatus("Print failed: " + (err && err.message ? err.message : "unknown error"));
    }
  });
})();
