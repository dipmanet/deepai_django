// Light/dark theme toggle. Persists choice in localStorage under "thread-theme".
(function () {
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("thread-theme", theme);
  }

  document.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-theme-toggle]");
    if (!btn) return;
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });
})();
