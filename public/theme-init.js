// Applies the saved theme before first paint, so there is no light/dark flash.
// External file (not inline) so the Content-Security-Policy can stay script-src 'self'.
// Mirrors next-themes: storage key "theme", default "dark", follows the OS for "system".
(function () {
  try {
    var t = localStorage.getItem("theme") || "dark";
    if (t === "system") {
      t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    var r = document.documentElement;
    r.classList.remove("light", "dark");
    r.classList.add(t === "light" ? "light" : "dark");
    r.style.colorScheme = t === "light" ? "light" : "dark";
  } catch (e) {}
})();
