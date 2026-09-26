/**
 * 最小限のハッシュルーター（ビルド不要のSPA用）。
 *
 * ルート例: "/records/:id/edit" は "#/records/42/edit" にマッチし、
 * params = { id: "42" } を渡す。クエリ文字列（"?date=2026-09-05"）は
 * 別途 URLSearchParams として渡される。
 */

const routes = []; // { pattern: string[], handler: fn }

export function addRoute(pattern, handler) {
  const segments = pattern.split("/").filter((s) => s !== "");
  routes.push({ segments, handler });
}

function matchRoute(pathSegments) {
  for (const route of routes) {
    if (route.segments.length !== pathSegments.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i += 1) {
      const routeSeg = route.segments[i];
      const pathSeg = pathSegments[i];
      if (routeSeg.startsWith(":")) {
        params[routeSeg.slice(1)] = decodeURIComponent(pathSeg);
      } else if (routeSeg !== pathSeg) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler: route.handler, params };
  }
  return null;
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, queryString = ""] = raw.split("?");
  const pathSegments = path.split("/").filter((s) => s !== "");
  const query = new URLSearchParams(queryString);
  return { pathSegments, query, path: `/${pathSegments.join("/")}` };
}

let notFoundHandler = (container) => {
  container.innerHTML = "<p>ページが見つかりません。</p>";
};

export function setNotFoundHandler(handler) {
  notFoundHandler = handler;
}

/** URLを組み立てる（画面遷移リンクのhref生成に使う）。 */
export function buildUrl(path, query = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ""))
  ).toString();
  return `#${path}${qs ? `?${qs}` : ""}`;
}

export function navigate(path, query = {}) {
  window.location.hash = buildUrl(path, query);
}

let onRouteChange = null;
export function setOnRouteChange(fn) {
  onRouteChange = fn;
}

export async function dispatch(container) {
  const { pathSegments, query, path } = parseHash();
  const match = matchRoute(pathSegments);
  if (onRouteChange) onRouteChange(path);
  if (!match) {
    notFoundHandler(container);
    return;
  }
  await match.handler(container, match.params, query);
}

export function startRouter(container) {
  window.addEventListener("hashchange", () => dispatch(container));
  window.addEventListener("DOMContentLoaded", () => dispatch(container));
  // DOMContentLoaded がすでに発火済みの場合（scriptがdeferやmodule末尾で読まれた場合）にも対応
  if (document.readyState !== "loading") {
    dispatch(container);
  }
}
