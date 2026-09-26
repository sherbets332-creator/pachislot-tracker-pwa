/**
 * 店舗・機種マスタ、貯玉換金・残高調整画面のDOMスモークテスト。
 * 実行: node js/logic/test/shopsMachines.smoke.test.js
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
dom.window.confirm = () => true;

const { openDatabase, DB_NAME } = await import("../../db.js");
const { createShop, createMachine, createRecord, listShops, listMachines } = await import("../../repository.js");
const { renderMachinesList } = await import("../../views/machinesListView.js");
const { renderMachineForm } = await import("../../views/machineFormView.js");
const { renderShopsList } = await import("../../views/shopsListView.js");
const { renderShopForm } = await import("../../views/shopFormView.js");
const { renderShopDetail } = await import("../../views/shopDetailView.js");
const { renderTransactionForm } = await import("../../views/transactionFormView.js");

let passCount = 0;

async function deleteTestDatabase() {
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    const timer = setTimeout(() => reject(new Error("deleteDatabaseがblockedのままタイムアウトしました")), 3000);
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

function wait(ms = 60) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fireEvent(el, type) {
  el.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------------------
await test("機種フォーム: 新規登録できる", async (db, container) => {
  await renderMachineForm(container, db, {});
  container.querySelector("#f-name").value = "北斗の拳";
  fireEvent(container.querySelector("#machine-form"), "submit");
  await wait();

  const machines = await listMachines(db);
  assert.equal(machines.length, 1);
  assert.equal(machines[0].name, "北斗の拳");
});

await test("機種一覧: アーカイブ後は一覧から消え、archived=1では出る", async (db, container) => {
  const machineId = await createMachine(db, { name: "テスト機種" });

  await renderMachineForm(container, db, { machineId });
  container.querySelector("#archive-btn").click();
  await wait();

  await renderMachinesList(container, db, new URLSearchParams(""));
  assert.doesNotMatch(container.textContent, /テスト機種/);

  await renderMachinesList(container, db, new URLSearchParams("archived=1"));
  assert.match(container.textContent, /テスト機種/);
});

await test("機種一覧: まとめて登録で複数行を一括登録でき、空行・重複はスキップされる", async (db, container) => {
  await createMachine(db, { name: "既存機種" });

  await renderMachinesList(container, db, new URLSearchParams(""));
  container.querySelector("#bulk-machine-names").value = "新機種A\n\n新機種B\n新機種A\n既存機種";
  container.querySelector("#bulk-add-btn").click();
  await wait();

  const machines = await listMachines(db);
  assert.deepEqual(
    machines.map((m) => m.name).sort(),
    ["新機種A", "新機種B", "既存機種"].sort()
  );
  assert.match(container.textContent, /2件登録しました/);
  assert.match(container.textContent, /2件は空欄または重複のためスキップ/);
});

await test("機種フォーム: 履歴がある機種は削除ボタンが出ない", async (db, container) => {
  const shopId = await createShop(db, { name: "店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "使用済み機種" });
  await createRecord(db, {
    play_date: "2026-01-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "1000", saved_ball_used: "0", payout_count: "0", saved_ball_earned: "0",
  });

  await renderMachineForm(container, db, { machineId });
  assert.equal(container.querySelector("#delete-btn"), null);
  assert.match(container.textContent, /記録があるため削除できません/);
});

// ---------------------------------------------------------------------------
await test("店舗フォーム: 新規登録・重複名エラー", async (db, container) => {
  await renderShopForm(container, db, {});
  container.querySelector("#f-name").value = "テスト店";
  container.querySelector("#f-exchange-rate").value = "20";
  container.querySelector("#f-lending-rate").value = "21.74";
  fireEvent(container.querySelector("#shop-form"), "submit");
  await wait();

  let shops = await listShops(db);
  assert.equal(shops.length, 1);

  // 同じ店舗名でもう一度登録しようとする -> エラー表示、遷移しない
  await renderShopForm(container, db, {});
  container.querySelector("#f-name").value = "テスト店";
  container.querySelector("#f-exchange-rate").value = "20";
  container.querySelector("#f-lending-rate").value = "20";
  fireEvent(container.querySelector("#shop-form"), "submit");
  await wait();
  assert.match(container.textContent, /すでに登録されています/);
  shops = await listShops(db);
  assert.equal(shops.length, 1);
});

await test("店舗フォーム: レート早見表クリックで反映される", async (db, container) => {
  await renderShopForm(container, db, {});
  const exchangeInput = container.querySelector("#f-exchange-rate");
  exchangeInput.focus();
  const row = container.querySelector('#rate-reference-table tr[data-rate="21.74"]');
  row.click();
  assert.equal(exchangeInput.value, "21.74");
});

await test("店舗詳細: 換金するとFIFO実現差額調整が表示される", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "テスト機種" });
  await createRecord(db, {
    play_date: "2026-01-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "2000",
  });

  await renderTransactionForm(container, db, { shopId, type: "cashout" });
  container.querySelector("#f-date").value = "2026-01-05";
  container.querySelector("#f-ball-count").value = "1000";
  container.querySelector("#f-cash-amount").value = "19000"; // 計算価値20000円との差-1000円
  fireEvent(container.querySelector("#tx-form"), "submit");
  await wait();

  await renderShopDetail(container, db, shopId);
  assert.match(container.textContent, /現在の貯玉残高/);
  assert.match(container.textContent, /1,000 枚/); // 2000-1000
  assert.match(container.textContent, /テスト機種/); // 換金差額調整履歴の台の記録欄
  assert.match(container.textContent, /-1,000円/); // 実現差額
});

await test("残高調整: 削除で残高が戻る", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });

  await renderTransactionForm(container, db, { shopId, type: "adjust" });
  container.querySelector("#f-date").value = "2026-01-01";
  container.querySelector("#f-ball-count").value = "300";
  fireEvent(container.querySelector("#tx-form"), "submit");
  await wait();

  await renderShopDetail(container, db, shopId);
  assert.match(container.textContent, /300 枚/);

  const editLink = container.querySelector('a[href*="/transactions/"]');
  const txId = Number(editLink.getAttribute("href").match(/transactions\/(\d+)\/edit/)[1]);

  await renderTransactionForm(container, db, { shopId, txId });
  container.querySelector("#delete-btn").click();
  await wait();

  await renderShopDetail(container, db, shopId);
  assert.match(container.textContent, /0 枚/);
});

await test("店舗フォーム: 履歴がある店舗はアーカイブのみ、削除ボタンは出ない", async (db, container) => {
  const shopId = await createShop(db, { name: "使用済み店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "機種" });
  await createRecord(db, {
    play_date: "2026-01-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "1000", saved_ball_used: "0", payout_count: "0", saved_ball_earned: "0",
  });

  await renderShopForm(container, db, { shopId });
  assert.equal(container.querySelector("#delete-btn"), null);
  assert.ok(container.querySelector("#archive-btn"));
});

console.log(`\n${passCount} 件成功`);
