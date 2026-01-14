import { qs } from "../lib/utils.js";

const routes = new Map();
let onRoute = null;

export function register(path, handler){ routes.set(path, handler); }

export function setRouteCallback(fn){ onRoute = fn; }

export function go(path){
  history.pushState({}, "", "#" + path);
  render();
}

export function current(){
  const h = location.hash.replace(/^#/, "");
  return h || "/home";
}

export function start(){
  window.addEventListener("popstate", render);
  window.addEventListener("hashchange", render);
  if(!location.hash) location.hash = "#/home";
  render();
}

async function render(){
  const path = current();
  const handler = routes.get(path) || routes.get("/404");
  if(onRoute) onRoute(path);
  const app = qs("#app");
  app.innerHTML = "";
  const node = await handler();
  if(node) app.appendChild(node);
}
