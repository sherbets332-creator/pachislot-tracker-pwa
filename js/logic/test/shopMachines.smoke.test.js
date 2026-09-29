/**
 * 店舗ごとの設置機種（shop_machines）のテスト。
 * repository層のCRUD、削除時の孤立リンク掃除、管理画面、記録フォームの機種絞り込みをカバーする。
 * 実行: node js/logic/test/shopMachines.smoke.test.js
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

const { openDatabase, DB_NAME, getAll, STORE_NAMES } = await import("../../db.js");
const {
  createShop,
  createMachine,
  createRecord,
  deleteShop,
  deleteMachine,
  archiveShop,
  getInstalledMachines,
  getInstalledMachineIds,
  setInstalledMachines,
} = await import("../../repository.js");
const { renderShopMachines } = await import("../../views/shopMachinesView.js");
const { renderRecordForm } = await import("../../views/recordFormView.js");

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
await test("setInstalledMachines: 設置機種を設定・上書き・全解除できる", async (db) => {
  const shopId = await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  const m1 = await createMachine(db, { name: "北斗の拳" });
  const m2 = await createMachine(db, { name: "モンキーターン" });
  const m3 = await createMachine(db, { name: "アイムジャグラー" });

  await setInstalledMachines(db, shopId, [m1, m2]);
  let ids = await getInstalledMachineIds(db, shopId);
  assert.deepEqual([...ids].sort(), [m1, m2].sort());

  const machines = await getInstalledMachines(db, shopId);
  assert.deepEqual(machines.map((m) => m.id).sort(), [m1, m2].sort());

  // 上書き：m2を外してm3を追加
  await setInstalledMachines(db, shopId, [m1, m3]);
  ids = await getInstalledMachineIds(db, shopId);
  assert.deepEqual([...ids].sort(), [m1, m3].sort());

  // 全解除
  await setInstalledMachines(db, shopId, []);
  ids = await getInstalledMachineIds(db, shopId);
  assert.equal(ids.size, 0);
});

await test("店舗を削除すると設置機種リンクも一緒に消える", async (db) => {
  const shopId = await createShop(db, { name: "店B", exchange_rate: "20", lending_rate: "20" });
  const m1 = await createMachine(db, { name: "機種1" });
  await setInstalledMachines(db, shopId, [m1]);

  await deleteShop(db, shopId);

  const links = await getAll(db, STORE_NAMES.SHOP_MACHINES);
  assert.equal(links.length, 0);
});

await test("機種を削除するとその機種の設置リンクだけ消える", async (db) => {
  const shopId = await createShop(db, { name: "店C", exchange_rate: "20", lending_rate: "20" });
  const m1 = await createMachine(db, { name: "消える機種" });
  const m2 = await createMachine(db, { name: "残る機種" });
  await setInstalledMachines(db, shopId, [m1, m2]);

  await deleteMachine(db, m1);

  const ids = await getInstalledMachineIds(db, shopId);
  assert.deepEqual([...ids], [m2]);
});

await test("設置機種アーカイブ済み店舗も削除ではなくアーカイブなら影響しない", async (db) => {
  const shopId = await createShop(db, { name: "店D", exchange_rate: "20", lending_rate: "20" });
  const m1 = await createMachine(db, { name: "機種D" });
  await setInstalledMachines(db, shopId, [m1]);

  await archiveShop(db, shopId);

  const ids = await getInstalledMachineIds(db, shopId);
  assert.deepEqual([...ids], [m1]); // アーカイブではリンクは消えない
});

// ---------------------------------------------------------------------------
await test("設置機種管理画面: チェックした機種だけ保存され、店舗詳細に戻る", async (db, container) => {
  const shopId = await createShop(db, { name: "店E", exchange_rate: "20", lending_rate: "20" });
  const m1 = await createMachine(db, { name: "機種E1" });
  const m2 = await createMachine(db, { name: "機種E2" });

  await renderShopMachines(container, db, shopId);
  const checkboxes = Array.from(container.querySelectorAll('#machine-checklist input[type=checkbox]'));
  assert.equal(checkboxes.length, 2);
  checkboxes.find((c) => Number(c.value) === m1).checked = true;

  fireEvent(container.querySelector("#shop-machines-form"), "submit");
  await wait();

  const ids = await getInstalledMachineIds(db, shopId);
  assert.deepEqual([...ids], [m1]);
  void m2;
});

await test("設置機種管理画面: 既存の設定がチェック済みで表示される", async (db, container) => {
  const shopId = await createShop(db, { name: "店F", exchange_rate: "20", lending_rate: "20" });
  const m1 = await createMachine(db, { name: "機種F1" });
  const m2 = await createMachine(db, { name: "機種F2" });
  await setInstalledMachines(db, shopId, [m2]);

  await renderShopMachines(container, db, shopId);
  const checkboxes = Array.from(container.querySelectorAll('#machine-checklist input[type=checkbox]'));
  const checkedValues = checkboxes.filter((c) => c.checked).map((c) => Number(c.value));
  assert.deepEqual(checkedValues, [m2]);
  void m1;
});

// ---------------------------------------------------------------------------
await test("記録フォーム: 設置機種が設定された店舗では機種選択肢が絞り込まれる", async (db, container) => {
  const shopId = await createShop(db, { name: "店G", exchange_rate: "20", lending_rate: "20" });
  const installed = await createMachine(db, { name: "設置済み機種" });
  const notInstalled = await createMachine(db, { name: "未設置機種" });
  await setInstalledMachines(db, shopId, [installed]);

  await renderRecordForm(container, db, {});
  const shopSelect = container.querySelector("#f-shop-id");
  shopSelect.value = String(shopId);
  fireEvent(shopSelect, "change");

  const machineSelect = container.querySelector("#f-machine-id");
  const installedOption = machineSelect.querySelector(`option[value="${installed}"]`);
  const notInstalledOption = machineSelect.querySelector(`option[value="${notInstalled}"]`);
  assert.equal(installedOption.hidden, false);
  assert.equal(notInstalledOption.hidden, true);
});

await test("記録フォーム: 設置機種が1つも設定されていない店舗では絞り込まない", async (db, container) => {
  const shopId = await createShop(db, { name: "店H", exchange_rate: "20", lending_rate: "20" });
  const m1 = await createMachine(db, { name: "機種H1" });
  const m2 = await createMachine(db, { name: "機種H2" });

  await renderRecordForm(container, db, {});
  const shopSelect = container.querySelector("#f-shop-id");
  shopSelect.value = String(shopId);
  fireEvent(shopSelect, "change");

  const machineSelect = container.querySelector("#f-machine-id");
  assert.equal(machineSelect.querySelector(`option[value="${m1}"]`).hidden, false);
  assert.equal(machineSelect.querySelector(`option[value="${m2}"]`).hidden, false);
});

await test("記録フォーム: 編集中の記録の機種が設置リストから外れていても表示され続ける", async (db, container) => {
  const shopId = await createShop(db, { name: "店I", exchange_rate: "20", lending_rate: "20" });
  const usedMachine = await createMachine(db, { name: "過去に使った機種" });
  const installedMachine = await createMachine(db, { name: "今の設置機種" });
  const recordId = await createRecord(db, {
    play_date: "2026-01-01", shop_id: String(shopId), machine_id: String(usedMachine),
    cash_investment: "1000", saved_ball_used: "0", payout_count: "0", saved_ball_earned: "0",
  });
  await setInstalledMachines(db, shopId, [installedMachine]); // usedMachineは設置リストに入れない

  await renderRecordForm(container, db, { recordId });

  const machineSelect = container.querySelector("#f-machine-id");
  const usedOption = machineSelect.querySelector(`option[value="${usedMachine}"]`);
  assert.ok(usedOption);
  assert.equal(usedOption.hidden, false); // 編集中の記録が使っている機種なので隠れない
});

console.log(`\n${passCount} 件成功`);
