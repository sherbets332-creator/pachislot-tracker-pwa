/**
 * アプリのエントリポイント：DBを開き、ルートを登録して起動する。
 */
import { openDatabase } from "./db.js";
import { startRouter, addRoute, setOnRouteChange, setNotFoundHandler } from "./router.js";
import { renderCalendar } from "./views/calendarView.js";
import { renderRecordsDay } from "./views/recordsDayView.js";
import { renderRecordForm } from "./views/recordFormView.js";

const dbPromise = openDatabase();

function setActiveNav(path) {
  document.querySelectorAll(".bottom-nav a[data-nav-match]").forEach((a) => {
    const match = a.dataset.navMatch;
    const isActive =
      match === "/calendar" ? path === "/" || path.startsWith("/calendar") || path.startsWith("/records") : path.startsWith(match);
    a.classList.toggle("active", isActive);
  });
}
setOnRouteChange(setActiveNav);

setNotFoundHandler((container) => {
  container.innerHTML = `<p class="muted">この画面はまだ実装されていません。</p>`;
});

addRoute("/", async (container, params, query) => {
  const db = await dbPromise;
  await renderCalendar(container, db, query);
});
addRoute("/calendar", async (container, params, query) => {
  const db = await dbPromise;
  await renderCalendar(container, db, query);
});
addRoute("/records/new", async (container, params, query) => {
  const db = await dbPromise;
  await renderRecordForm(container, db, { date: query.get("date") });
});
addRoute("/records/:id/edit", async (container, params) => {
  const db = await dbPromise;
  await renderRecordForm(container, db, { recordId: Number(params.id) });
});
addRoute("/records/day/:date", async (container, params) => {
  const db = await dbPromise;
  await renderRecordsDay(container, db, params.date);
});

const appContainer = document.getElementById("app");
startRouter(appContainer);
