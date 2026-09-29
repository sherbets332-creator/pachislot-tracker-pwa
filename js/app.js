/**
 * アプリのエントリポイント：DBを開き、ルートを登録して起動する。
 */
import { openDatabase } from "./db.js";
import { startRouter, addRoute, setOnRouteChange, setNotFoundHandler } from "./router.js";
import { renderCalendar } from "./views/calendarView.js";
import { renderRecordsDay } from "./views/recordsDayView.js";
import { renderRecordForm } from "./views/recordFormView.js";
import { renderShopsList } from "./views/shopsListView.js";
import { renderShopForm } from "./views/shopFormView.js";
import { renderShopDetail } from "./views/shopDetailView.js";
import { renderShopMachines } from "./views/shopMachinesView.js";
import { renderTransactionForm } from "./views/transactionFormView.js";
import { renderMachinesList } from "./views/machinesListView.js";
import { renderMachineForm } from "./views/machineFormView.js";
import { renderReports } from "./views/reportsView.js";
import { renderSettings } from "./views/settingsView.js";
import { renderRecordsList } from "./views/recordsListView.js";

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
addRoute("/records/list", async (container, params, query) => {
  const db = await dbPromise;
  await renderRecordsList(container, db, query);
});

addRoute("/shops", async (container, params, query) => {
  const db = await dbPromise;
  await renderShopsList(container, db, query);
});
addRoute("/shops/new", async (container) => {
  const db = await dbPromise;
  await renderShopForm(container, db, {});
});
addRoute("/shops/:id/edit", async (container, params) => {
  const db = await dbPromise;
  await renderShopForm(container, db, { shopId: Number(params.id) });
});
addRoute("/shops/:id/cashout", async (container, params) => {
  const db = await dbPromise;
  await renderTransactionForm(container, db, { shopId: Number(params.id), type: "cashout" });
});
addRoute("/shops/:id/adjust", async (container, params) => {
  const db = await dbPromise;
  await renderTransactionForm(container, db, { shopId: Number(params.id), type: "adjust" });
});
addRoute("/shops/:id/transactions/:txId/edit", async (container, params) => {
  const db = await dbPromise;
  await renderTransactionForm(container, db, { shopId: Number(params.id), txId: Number(params.txId) });
});
addRoute("/shops/:id/machines", async (container, params) => {
  const db = await dbPromise;
  await renderShopMachines(container, db, Number(params.id));
});
addRoute("/shops/:id", async (container, params) => {
  const db = await dbPromise;
  await renderShopDetail(container, db, Number(params.id));
});

addRoute("/machines", async (container, params, query) => {
  const db = await dbPromise;
  await renderMachinesList(container, db, query);
});
addRoute("/machines/new", async (container) => {
  const db = await dbPromise;
  await renderMachineForm(container, db, {});
});
addRoute("/machines/:id/edit", async (container, params) => {
  const db = await dbPromise;
  await renderMachineForm(container, db, { machineId: Number(params.id) });
});

addRoute("/reports", async (container) => {
  const db = await dbPromise;
  await renderReports(container, db);
});

addRoute("/settings", async (container) => {
  const db = await dbPromise;
  await renderSettings(container, db);
});

const appContainer = document.getElementById("app");
startRouter(appContainer);

// オフラインで動くようにするためのService Worker登録（対応ブラウザのみ、失敗しても致命的ではない）。
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service Worker registration failed:", err);
    });
  });
}
