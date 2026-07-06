// Tiny hash router: #/desk, #/journal, … swap views into one outlet, no build
// step. A view is { mount(outlet, path), unmount?() }. The unknown-route view
// is registered under "*".

const routes = {};
let current = null;
let outlet = null;

export function register(path, view) { routes[path] = view; }

export function currentPath() {
  return (location.hash.replace(/^#/, "").split("?")[0]) || "/desk";
}

function go() {
  const path = currentPath();
  const view = routes[path] || routes["*"];
  if (current && current.unmount) current.unmount();
  outlet.innerHTML = "";
  current = view;
  document.dispatchEvent(new CustomEvent("route", { detail: path }));
  view.mount(outlet, path);
  window.scrollTo(0, 0);
}

export function start(el) {
  outlet = el;
  window.addEventListener("hashchange", go);
  if (!location.hash) location.hash = "#/desk";
  else go();
}
