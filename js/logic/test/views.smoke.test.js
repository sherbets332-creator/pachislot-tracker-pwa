/**
 * カレンダー・記録一覧・記録フォームのDOMスモークテスト。
 * jsdom + fake-indexeddb（どちらも開発時のみの依存。本番のPWAには含まれない）で、
 * 実際にHTMLを描画し、フォーム送信やボタンクリックまで通しで検証する。
 *
 * 実行: node js/logic/test/views.smoke.test.js
 */
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";

const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", {
  url: "http://localhost/",
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event;
// Node のグローバルスコープはブラウザの window とは別物なので、
// window.xxx を bare identifier として使っているコード（sessionStorage等）のために
// 必要なプロパティを個別にコピーする。
global.sessionStorage = dom.window.sessionStorage;
dom.window.confirm = () => true;

const { openDatabase, DB_NAME, getAll, STORE_NAMES } = await import("../../db.js");
const { createShop, createMachine, createRecord, getRecord } = await import("../../repository.js");
const { renderCalendar } = await import("../../views/calendarView.js");
const { renderRecordsDay } = await import("../../views/recordsDayView.js");
const { renderRecordForm } = await import("../../views/recordFormView.js");

let passCount = 0;
async function deleteTestDatabase() {
  // 前のテストが失敗してdb.close()に到達できなかった場合に備えて、
  // deleteDatabaseが"blocked"のまま永久に待つことがないようタイムアウトを設ける。
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    const timer = setTimeout(() => reject(new Error("deleteDatabaseがblockedのままタイムアウトしました（前のテストのdbが閉じ忘れ？）")), 3000);
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

// ---------------------------------------------------------------------------
await test("カレンダー: 記録が無い月は空のグリッドが描画される", async (db, container) => {
  await renderCalendar(container, db, new URLSearchParams("year=2026&month=9"));
  assert.match(container.querySelector("h1").textContent, /2026年9月/);
  assert.ok(container.querySelector(".calendar-table"));
  assert.ok(container.querySelector('a[href*="/records/new"]'));
});

await test("カレンダー: 記録がある日にその日の表示用収支が出る", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "テスト機種" });
  await createRecord(db, {
    play_date: "2026-09-05", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "2000", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "0",
  });

  await renderCalendar(container, db, new URLSearchParams("year=2026&month=9"));
  const dayLink = container.querySelector('a[href*="/records/day/2026-09-05"]');
  assert.ok(dayLink, "2026-09-05へのリンクがあるはず");
  assert.match(dayLink.querySelector(".day-amount").textContent, /38,000/); // 2000*20 - 2000
});

// ---------------------------------------------------------------------------
await test("記録一覧: 記録が表示され、削除ボタンで消える", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "テスト機種" });
  const recordId = await createRecord(db, {
    play_date: "2026-09-05", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "1000", saved_ball_earned: "0",
  });

  await renderRecordsDay(container, db, "2026-09-05");
  assert.match(container.textContent, /テスト店/);
  assert.match(container.textContent, /テスト機種/);

  // ⋮メニューを開いて削除ボタンを押す
  container.querySelector(".menu-toggle").click();
  const deleteBtn = container.querySelector(".delete-btn");
  assert.ok(!deleteBtn.closest(".menu-popup").classList.contains("hidden"), "メニューが開いているはず");
  deleteBtn.click();
  await wait();

  const deleted = await getRecord(db, recordId);
  assert.equal(deleted, undefined, "削除されているはず");
});

// ---------------------------------------------------------------------------
await test("記録フォーム: 新規登録が保存され、カレンダーに遷移する", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "テスト機種" });

  await renderRecordForm(container, db, { date: "2026-09-10" });
  container.querySelector("#f-shop-id").value = String(shopId);
  container.querySelector("#f-machine-id").value = String(machineId);
  container.querySelector("#f-payout-count").value = "1500";
  container.querySelector("#f-payout-count").dispatchEvent(new dom.window.Event("input", { bubbles: true }));

  dom.window.location.hash = "#/records/new"; // submit後のnavigateを検知できるようにリセット
  container.querySelector("#record-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await wait();

  assert.equal(dom.window.location.hash, "#/calendar", "保存後にカレンダーへ遷移するはず");

  const all = await getAll(db, STORE_NAMES.RECORDS);
  assert.equal(all.length, 1);
  assert.equal(all[0].payout_count, 1500);
  assert.equal(all[0].saved_ball_earned, 1500); // 回収枚数入力で貯玉獲得数も自動連動しているはず
});

await test("記録フォーム: バリデーションエラー時は同じ画面にエラー表示（入力値は保持）", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "テスト機種" });

  await renderRecordForm(container, db, { date: "2026-09-11" });
  container.querySelector("#f-shop-id").value = String(shopId);
  container.querySelector("#f-machine-id").value = String(machineId);
  container.querySelector("#f-saved-ball-used").value = "920"; // 残高0なので不足エラーになるはず

  container.querySelector("#record-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await wait();

  assert.match(container.textContent, /貯玉残高が不足しています/);
  // 入力していた値がフォームに残っているはず（全ページ遷移ではないため）
  assert.equal(container.querySelector("#f-saved-ball-used").value, "920");
});

console.log(`\n${passCount} 件成功`);
