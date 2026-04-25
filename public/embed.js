(function () {
  if (window.__creatoros_loaded) return;
  window.__creatoros_loaded = true;

  var script = document.currentScript;
  var slug = script && script.getAttribute("data-creator");
  if (!slug) {
    console.error("[CreatorOS] Missing data-creator attribute on embed script");
    return;
  }

  var host = script.getAttribute("data-host") || script.src.replace(/\/embed\.js.*$/, "");

  var container = document.createElement("div");
  container.id = "creatoros-widget";
  container.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:999999;font-family:system-ui,-apple-system,sans-serif;";

  // Chat bubble button
  var bubble = document.createElement("button");
  bubble.id = "creatoros-bubble";
  bubble.innerHTML = "💬";
  bubble.style.cssText =
    "width:56px;height:56px;border-radius:50%;background:#2563eb;border:none;cursor:pointer;font-size:24px;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.2s;";
  bubble.onmouseover = function () {
    bubble.style.transform = "scale(1.1)";
  };
  bubble.onmouseout = function () {
    bubble.style.transform = "scale(1)";
  };

  // Iframe container
  var iframeWrap = document.createElement("div");
  iframeWrap.style.cssText =
    "display:none;width:380px;height:600px;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.12);margin-bottom:12px;";

  var iframe = document.createElement("iframe");
  iframe.src = host + "/chat/" + slug;
  iframe.style.cssText = "width:100%;height:100%;border:none;";
  iframe.setAttribute("allow", "clipboard-write");

  // CSP fallback: detect iframe load failure
  var loadTimeout = setTimeout(function () {
    iframeWrap.innerHTML = "";
    var fallback = document.createElement("a");
    fallback.href = host + "/" + slug;
    fallback.target = "_blank";
    fallback.rel = "noopener";
    fallback.textContent = "Chat with this creator →";
    fallback.style.cssText =
      "display:block;padding:16px;background:white;border-radius:12px;text-align:center;color:#2563eb;text-decoration:none;font-size:14px;font-weight:500;";
    iframeWrap.appendChild(fallback);
  }, 5000);

  iframe.onload = function () {
    clearTimeout(loadTimeout);
  };

  iframeWrap.appendChild(iframe);

  // Toggle
  var isOpen = false;
  bubble.onclick = function () {
    isOpen = !isOpen;
    iframeWrap.style.display = isOpen ? "block" : "none";
    bubble.innerHTML = isOpen ? "✕" : "💬";
  };

  // PostMessage handler for resize
  window.addEventListener("message", function (e) {
    if (e.origin !== new URL(host).origin) return;
    if (e.data && e.data.type === "creatoros-resize") {
      iframeWrap.style.height = e.data.height + "px";
    }
  });

  container.appendChild(iframeWrap);
  container.appendChild(bubble);
  document.body.appendChild(container);
})();
