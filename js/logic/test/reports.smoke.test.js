/**
 * 収支分析（reports）の集計関数・画面のスモークテスト。
 * 実行: node js/logic/test/reports.smoke.test.js
 */
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";

const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", { url: "http://localhost/" });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event;
global.sessionStorage = dom.window.sessionStorage;

const { openDatabase, DB_NAME } = await import("../../db.js");
const {
  createShop,
  createMachine,
  createRecord,
  createCashout,
  getYearlyTotals,
  getMonthlyTotals,
  getMachineTotals,
  getShopTotals,
  getCashoutTotalsByShop,
} = await import("../../repository.js");
const { renderReports } = await import("../../views/reportsView.js");
const { renderShopDetail } = await import("../../views/shopDetailView.js");

let passCount = 0;
async function deleteTestDatabase() {
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    const timer = setTimeout(() => reject(new Error("deleteDatabaseがタイムアウトしました")), 3000);
    req.onsuccess = () => { clearTimeout(timer); resolve(); };
    req.onerror = () => { clearTimeout(timer); reject(req.error); };
    req.onblocked = () => { clearTimeout(timer); reject(new Error("deleteDatabaseがblockedになりました")); };
  });
}
async function test(name, fn) {
  let db;
  try {
    await deleteTestDatabase();
    db = await openDatabase();
    const container = dom.window.document.getElementById("app");
    container.innerHTML = "";
    await fn(db, container);
    passCount += 1;
    console.log(`OK   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (db) db.close();
  }
}

// ---------------------------------------------------------------------------
await test("集計関数: 年別・月別・機種別・店舗別が正しく集計される", async (db) => {
  const shopId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  const machineId1 = await createMachine(db, { name: "機種A" });
  const machineId2 = await createMachine(db, { name: "機種B" });

  // 2026-08-01: 機種A、現金投資2000円・回収2000枚 -> 38000円
  await createRecord(db, {
    play_date: "2026-08-01", shop_id: String(shopId), machine_id: String(machineId1),
    cash_investment: "2000", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "0",
  });
  // 2026-08-02: 機種A、回収1000枚を貯玉に -> 20000円、貯玉残高1000枚に
  await createRecord(db, {
    play_date: "2026-08-02", shop_id: String(shopId), machine_id: String(machineId1),
    cash_investment: "0", saved_ball_used: "0", payout_count: "1000", saved_ball_earned: "1000",
  });
  // 2026-09-06: 機種B、貯玉500枚使用 -> -10000円
  await createRecord(db, {
    play_date: "2026-09-06", shop_id: String(shopId), machine_id: String(machineId2),
    cash_investment: "0", saved_ball_used: "500", payout_count: "0", saved_ball_earned: "0",
  });

  const yearly = await getYearlyTotals(db);
  assert.equal(yearly.length, 1);
  assert.equal(yearly[0].year, "2026");
  assert.equal(yearly[0].playCount, 3);
  assert.equal(yearly[0].total, 38000 + 20000 - 10000);

  const monthly = await getMonthlyTotals(db);
  assert.deepEqual(monthly.map((m) => m.ym), ["2026-08", "2026-09"]);

  const byMachine = await getMachineTotals(db);
  assert.equal(byMachine.length, 2);
  const machineA = byMachine.find((m) => m.machineName === "機種A");
  assert.equal(machineA.playCount, 2);
  assert.equal(machineA.total, 38000 + 20000);

  const byShop = await getShopTotals(db);
  assert.equal(byShop.length, 1);
  assert.equal(byShop[0].playCount, 3);
});

await test("換金額の集計: 収支合計には含まれず、参考値として別集計される", async (db) => {
  const shopId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "機種A" });
  await createRecord(db, {
    play_date: "2026-08-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "1000", saved_ball_earned: "1000",
  });
  await createCashout(db, shopId, { transaction_date: "2026-08-02", ball_count: "1000", cash_amount: "20000" });

  const byShop = await getShopTotals(db);
  assert.equal(byShop[0].total, 20000); // 換金額は混ざらない

  const cashoutTotals = await getCashoutTotalsByShop(db);
  assert.equal(cashoutTotals[0].totalCashout, 20000);
});

// ---------------------------------------------------------------------------
await test("収支分析画面: 表とグラフが描画される", async (db, container) => {
  const shopId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "機種A" });
  await createRecord(db, {
    play_date: "2026-08-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "2000", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "0",
  });

  await renderReports(container, db);
  assert.match(container.textContent, /収支分析/);
  assert.match(container.textContent, /2026年/);
  assert.match(container.textContent, /機種A/);
  assert.ok(container.querySelector("svg"), "グラフのsvgが描画されているはず");
});

await test("収支分析画面: 記録が無くてもエラーにならない", async (db, container) => {
  await renderReports(container, db);
  assert.match(container.textContent, /記録がありません/);
});

await test("店舗詳細: 貯玉残高推移グラフが描画される", async (db, container) => {
  const shopId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "機種A" });
  await createRecord(db, {
    play_date: "2026-08-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "1000", saved_ball_earned: "1000",
  });

  await renderShopDetail(container, db, shopId);
  assert.match(container.textContent, /貯玉残高の推移/);
  assert.ok(container.querySelector("svg"), "推移グラフのsvgが描画されているはず");
});

console.log(`\n${passCount} 件成功`);
