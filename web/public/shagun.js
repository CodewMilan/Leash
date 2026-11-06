/* Send a Shagun widget. Usage: Shagun.button("#target", { amount, note, campaign, app, onGift }) */
(function () {
  var script = document.currentScript;
  var origin = script ? new URL(script.src).origin : window.location.origin;

  function open(options) {
    options = options || {};
    var params = new URLSearchParams({ parent: window.location.origin });
    ["amount", "design", "note", "campaign", "app"].forEach(function (key) {
      if (options[key]) params.set(key, String(options[key]));
    });
    var width = 460, height = 780;
    var left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    var top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    var popup = window.open(
      origin + "/send?" + params.toString(),
      "shagun-send",
      "popup,width=" + width + ",height=" + height + ",left=" + left + ",top=" + top,
    );
    if (!popup) {
      if (options.onError) options.onError(new Error("Allow pop-ups to send a Shagun."));
      return null;
    }
    function receive(event) {
      if (event.origin !== origin || event.source !== popup) return;
      var data = event.data || {};
      if (data.source !== "shagun") return;
      if (data.type === "ready" && options.onReady) options.onReady();
      if (data.type === "gift" && options.onGift) options.onGift(data.gift);
    }
    window.addEventListener("message", receive);
    var watch = window.setInterval(function () {
      if (!popup.closed) return;
      window.clearInterval(watch);
      window.removeEventListener("message", receive);
      if (options.onClose) options.onClose();
    }, 500);
    return popup;
  }

  function button(target, options) {
    var el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) throw new Error("Shagun: target element not found.");
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = (options && options.label) || "Send a Shagun";
    b.style.cssText =
      "display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border:0;border-radius:999px;" +
      "background:#193ef9;color:#fff;font:600 15px/1 system-ui,sans-serif;cursor:pointer";
    b.addEventListener("click", function () {
      open(options);
    });
    el.appendChild(b);
    return b;
  }

  window.Shagun = { open: open, button: button, origin: origin };
})();
