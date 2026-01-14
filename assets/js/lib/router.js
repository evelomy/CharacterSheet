export function route(){
  const h = location.hash.replace(/^#/, "");
  const [path, q] = h.split("?");
  const params = new URLSearchParams(q||"");
  return { path: path || "/", params };
}
export function go(path){ location.hash = path; }
export function start(render){
  window.addEventListener("hashchange", render);
  render();
}
