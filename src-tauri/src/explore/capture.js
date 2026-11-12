// Injected into the Explore browser pane. This runs on the remote page, so it has no access
// to Tauri IPC. It talks to the app only by attempting a navigation to daiku-capture://,
// which Rust cancels and forwards. Payloads are treated as untrusted and always reviewed
// by the user in the capture tray before anything is downloaded.
(function () {
  if (window.top !== window || window.__daikuCapture) return;
  var MIN = 120;
  var meta = function (sel) {
    var el = document.querySelector(sel);
    return el ? (el.getAttribute("content") || "").slice(0, 300) : "";
  };
  var page = function () {
    return {
      pageUrl: location.href,
      pageTitle: (document.title || "").slice(0, 300),
      author: meta('meta[name="author"]') || meta('meta[property="article:author"]'),
      site: meta('meta[property="og:site_name"]'),
    };
  };
  var send = function (payload) {
    location.href = "daiku-capture://c/?p=" + encodeURIComponent(JSON.stringify(payload));
  };
  var src = function (img) {
    return img.currentSrc || img.src || "";
  };
  var http = function (u) {
    return /^https?:/i.test(u);
  };

  Object.defineProperty(window, "__daikuCapture", {
    value: function () {
      var seen = {};
      var images = [];
      var add = function (u, alt, w, h) {
        if (!http(u) || seen[u] || images.length >= 120) return;
        seen[u] = 1;
        images.push({ src: u, alt: (alt || "").slice(0, 300), width: w || 0, height: h || 0 });
      };
      var og = meta('meta[property="og:image"]');
      if (og) {
        try {
          add(new URL(og, location.href).href, "", 0, 0);
        } catch (e) {}
      }
      Array.prototype.forEach.call(document.images, function (img) {
        if (img.naturalWidth >= MIN && img.naturalHeight >= MIN) {
          add(src(img), img.alt, img.naturalWidth, img.naturalHeight);
        }
      });
      send({ kind: "page", page: page(), images: images });
    },
  });

  // Highlighting: a button appears beside what's selected. It sends text and any images in the
  // selection to the tray for review, the same as every other capture.
  var selHost, selBtn;
  var selectedImages = function (sel) {
    if (!sel.rangeCount) return [];
    var range = sel.getRangeAt(0);
    var seen = {};
    var out = [];
    Array.prototype.forEach.call(document.images, function (img) {
      var u = src(img);
      if (out.length < 40 && http(u) && !seen[u] && img.naturalWidth >= 32 && range.intersectsNode(img)) {
        seen[u] = 1;
        out.push({ src: u, alt: (img.alt || "").slice(0, 300), width: img.naturalWidth, height: img.naturalHeight });
      }
    });
    return out;
  };
  var hideSelection = function () {
    if (selHost) selHost.style.display = "none";
  };
  var ensureSelection = function () {
    if (selHost && selHost.isConnected) return;
    selHost = document.createElement("div");
    selHost.style.cssText = "position:fixed;z-index:2147483647;left:0;top:0;display:none";
    var root = selHost.attachShadow({ mode: "closed" });
    selBtn = document.createElement("button");
    selBtn.textContent = "Save to Daiku";
    selBtn.style.cssText =
      "font:700 12px system-ui,sans-serif;height:32px;padding:0 14px;border:0;border-radius:999px;" +
      "background:#1E1F1C;color:#FBFAF7;cursor:pointer;box-shadow:0 6px 16px -6px rgba(0,0,0,.6)";
    // Pressing a button normally clears the selection, which is the thing being saved.
    selBtn.addEventListener("mousedown", function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
    selBtn.addEventListener(
      "click",
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        var sel = window.getSelection();
        if (!sel) return;
        var text = sel.toString().trim().slice(0, 20000);
        var images = selectedImages(sel);
        hideSelection();
        if (text || images.length) send({ kind: "selection", page: page(), text: text, images: images });
      },
      true,
    );
    root.appendChild(selBtn);
    document.documentElement.appendChild(selHost);
  };
  var showSelection = function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hideSelection();
    if (!sel.toString().trim() && !selectedImages(sel).length) return hideSelection();
    var rects = sel.getRangeAt(0).getClientRects();
    var last = rects.length ? rects[rects.length - 1] : sel.getRangeAt(0).getBoundingClientRect();
    ensureSelection();
    var below = last.bottom + 8;
    selHost.style.left = Math.min(Math.max(4, last.right - 60), window.innerWidth - 130) + "px";
    selHost.style.top = (below > window.innerHeight - 44 ? Math.max(4, last.top - 40) : below) + "px";
    selHost.style.display = "block";
  };
  document.addEventListener(
    "mouseup",
    function (e) {
      if (e.target !== selHost) setTimeout(showSelection, 10);
    },
    true,
  );
  document.addEventListener(
    "keyup",
    function (e) {
      if (e.shiftKey || e.key === "Shift" || (e.ctrlKey && e.key === "a")) showSelection();
    },
    true,
  );
  document.addEventListener("selectionchange", function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) hideSelection();
  });
  window.addEventListener("scroll", hideSelection, { capture: true, passive: true });

  var host, btn, current;
  var ensure = function () {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483647;left:0;top:0;display:none";
    var root = host.attachShadow({ mode: "closed" });
    btn = document.createElement("button");
    btn.textContent = "Save to Daiku";
    btn.style.cssText =
      "font:700 12px system-ui,sans-serif;height:32px;padding:0 14px;border:0;border-radius:999px;" +
      "background:#1E1F1C;color:#FBFAF7;cursor:pointer;box-shadow:0 6px 16px -6px rgba(0,0,0,.6)";
    btn.addEventListener(
      "click",
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!current) return;
        send({
          kind: "image",
          page: page(),
          images: [
            {
              src: src(current),
              alt: (current.alt || "").slice(0, 300),
              width: current.naturalWidth,
              height: current.naturalHeight,
            },
          ],
        });
      },
      true,
    );
    root.appendChild(btn);
    document.documentElement.appendChild(host);
  };
  document.addEventListener(
    "mouseover",
    function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && http(src(t)) && t.width >= MIN && t.height >= MIN) {
        ensure();
        current = t;
        var r = t.getBoundingClientRect();
        host.style.left = Math.max(4, r.right - 128) + "px";
        host.style.top = Math.max(4, r.top + 8) + "px";
        host.style.display = "block";
      } else if (host && t !== host) {
        host.style.display = "none";
      }
    },
    true,
  );
})();
