/**
 * 記録の検索・フィルター機能（repository.searchRecords / recordsListView）のテスト。
 * 実行: node js/logic/test/recordsList.smoke.test.js
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
const { createShop, createMachine, createRecord, searchRecords } = await import("../../repository.js");
const { renderRecordsList } = await import("../../views/recordsListView.js");

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
await test("searchRecords: 店舗・機種・期間で絞り込める", async (db) => {
  const shopAId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  const shopBId = await createShop(db, { name: "店B", exchange_rate: "20", lending_rate: "20" });
  const machineAId = await createMachine(db, { name: "機種A" });
  const machineBId = await createMachine(db, { name: "機種B" });

  await createRecord(db, {
    play_date: "2026-08-01", shop_id: String(shopAId), machine_id: String(machineAId),
    cash_investment: "1000", saved_ball_used: "0", payout_count: "0", saved_ball_earned: "0",
  });
  await createRecord(db, {
    play_date: "2026-08-15", shop_id: String(shopAId), machine_id: String(machineBId),
    cash_investment: "2000", saved_ball_used: "0", payout_count: "0", saved_ball_earned: "0",
  });
  await createRecord(db, {
    play_date: "2026-09-01", shop_id: String(shopBId), machine_id: String(machineAId),
    cash_investment: "3000", saved_ball_used: "0", payout_count: "0", saved_ball_earned: "0",
  });

  // 店舗Aだけ
  let results = await searchRecords(db, { shopId: shopAId });
  assert.equal(results.length, 2);

  // 機種Aだけ
  results = await searchRecords(db, { machineId: machineAId });
  assert.equal(results.length, 2);

  // 店舗A かつ 機種A
  results = await searchRecords(db, { shopId: shopAId, machineId: machineAId });
  assert.equal(results.length, 1);
  assert.equal(results[0].play_date, "2026-08-01");

  // 期間指定（8月のみ）
  results = await searchRecords(db, { dateFrom: "2026-08-01", dateTo: "2026-08-31" });
  assert.equal(results.length, 2);

  // 条件なし → 全件、新しい日付順
  results = await searchRecords(db);
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.play_date), ["2026-09-01", "2026-08-15", "2026-08-01"]);
});

await test("searchRecords: 表示用収支（実現差額調整込み）が正しく計算される", async (db) => {
  const shopId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "機種A" });

  const recordId = await createRecord(db, {
    play_date: "2026-08-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "2000",
  });
  const { createCashout } = await import("../../repository.js");
  await createCashout(db, shopId, { transaction_date: "2026-08-02", ball_count: "2000", cash_amount: "38000" }); // 計算価値40000円との差-2000円

  const results = await searchRecords(db, { shopId });
  const record = results.find((r) => r.id === recordId);
  assert.equal(record.profit_amount, 40000);
  assert.equal(record.display_profit, 40000 - 2000);
});

// ---------------------------------------------------------------------------
await test("記録検索画面: フィルターフォームと結果が描画される", async (db, container) => {
  const shopId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "機種A" });
  await createRecord(db, {
    play_date: "2026-08-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "1000", saved_ball_used: "0", payout_count: "0", saved_ball_earned: "0",
  });

  await renderRecordsList(container, db, new URLSearchParams(""));
  assert.match(container.textContent, /記録の検索/);
  assert.match(container.textContent, /店A/);
  assert.match(container.textContent, /機種A/);
  assert.match(container.textContent, /1件・合計収支/);
});

await test("記録検索画面: 条件に合う記録が無いときのメッセージ", async (db, container) => {
  await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  await renderRecordsList(container, db, new URLSearchParams("shop_id=999"));
  assert.match(container.textContent, /条件に合う記録がありません/);
});

await test("記録検索画面: フィルターを変更して送信するとURLが更新される", async (db, container) => {
  const shopId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  await createMachine(db, { name: "機種A" });

  await renderRecordsList(container, db, new URLSearchParams(""));
  container.querySelector("#f-shop").value = String(shopId);
  container.querySelector("#filter-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(dom.window.location.hash, `#/records/list?shop_id=${shopId}`);
});

console.log(`\n${passCount} 件成功`);
