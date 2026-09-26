/**
 * エクスポート/インポート（js/dataTransfer.js, 「その他」画面）のテスト。
 * 実行: node js/logic/test/dataTransfer.smoke.test.js
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
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
dom.window.confirm = () => true;
// jsdomはURL.createObjectURL/revokeObjectURLを実装していない（ブラウザ専用API）ため、
// テスト用に最小限のスタブを用意する。
dom.window.URL.createObjectURL = () => "blob:mock-url";
dom.window.URL.revokeObjectURL = () => {};

const { openDatabase, DB_NAME, getAll, STORE_NAMES } = await import("../../db.js");
const { createShop, createMachine, createRecord, createCashout, getShopBalance } = await import("../../repository.js");
const { exportAllData, importAllData, ImportError } = await import("../../dataTransfer.js");
const { renderSettings } = await import("../../views/settingsView.js");

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
await test("エクスポート→別DBへインポートで完全に復元できる（往復テスト）", async (db) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "21.74", address: "どこか", memo: "メモ" });
  const machineId = await createMachine(db, { name: "テスト機種", maker: "メーカー" });
  const recordId = await createRecord(db, {
    play_date: "2026-08-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "2000", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "1000", memo: "メモ",
  });
  await createCashout(db, shopId, { transaction_date: "2026-08-02", ball_count: "500", cash_amount: "9500" });

  const exported = await exportAllData(db);
  assert.equal(exported.shops.length, 1);
  assert.equal(exported.machines.length, 1);
  assert.equal(exported.records.length, 1);
  assert.equal(exported.saved_ball_transactions.length, 2); // earn(1000) + cashout(500)

  // 別のDB（同名を使い回す前提なので、いったん全消去してから）にインポートする
  await importAllData(db, exported);

  const shopsAfter = await getAll(db, STORE_NAMES.SHOPS);
  const machinesAfter = await getAll(db, STORE_NAMES.MACHINES);
  const recordsAfter = await getAll(db, STORE_NAMES.RECORDS);
  const txsAfter = await getAll(db, STORE_NAMES.SAVED_BALL_TRANSACTIONS);

  assert.equal(shopsAfter.length, 1);
  assert.equal(shopsAfter[0].id, shopId);
  assert.equal(shopsAfter[0].name, "テスト店");
  assert.equal(machinesAfter.length, 1);
  assert.equal(recordsAfter.length, 1);
  assert.equal(recordsAfter[0].id, recordId);
  assert.equal(recordsAfter[0].memo, "メモ");
  assert.equal(txsAfter.length, 2);

  // 残高計算も正しく引き継がれているはず（1000獲得-500換金=500）
  assert.equal(await getShopBalance(db, shopId), 500);
});

await test("インポート後も新規作成でid衝突しない（自動採番カウンタが引き継がれる）", async (db) => {
  const shopId = await createShop(db, { name: "店1", exchange_rate: "20", lending_rate: "20" });
  const exported = await exportAllData(db);
  await importAllData(db, exported);

  const newShopId = await createShop(db, { name: "店2", exchange_rate: "20", lending_rate: "20" });
  assert.notEqual(newShopId, shopId, "新規作成したidが既存のidと衝突していないはず");

  const all = await getAll(db, STORE_NAMES.SHOPS);
  assert.equal(all.length, 2);
});

await test("インポート: 不正な形式のJSONはエラーになり、既存データは消えない", async (db) => {
  await createShop(db, { name: "店1", exchange_rate: "20", lending_rate: "20" });

  await assert.rejects(importAllData(db, { shops: "配列じゃない" }), ImportError);

  const all = await getAll(db, STORE_NAMES.SHOPS);
  assert.equal(all.length, 1, "エラー時は既存データがそのまま残っているはず");
});

// ---------------------------------------------------------------------------
await test("設定画面: エクスポートボタンでBlobダウンロードがトリガーされる", async (db, container) => {
  await createShop(db, { name: "店1", exchange_rate: "20", lending_rate: "20" });
  await renderSettings(container, db);

  let downloadTriggered = false;
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.download.startsWith("pachislot-export-")) downloadTriggered = true;
  };
  try {
    container.querySelector("#export-btn").click();
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(downloadTriggered, "エクスポート用のダウンロードリンクがクリックされたはず");
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
  }
});

console.log(`\n${passCount} 件成功`);
