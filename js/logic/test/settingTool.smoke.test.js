/**
 * 設定判別ツール画面（トップ・観測記録フォーム）のDOMスモークテスト。
 * 実行: node js/logic/test/settingTool.smoke.test.js
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
const { createShop, createMachine, listSettingObservations } = await import("../../repository.js");
const { renderSettingTool } = await import("../../views/settingToolView.js");
const { renderSettingObservationForm } = await import("../../views/settingObservationFormView.js");

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
await test("設定判別ツール: 対応機種が無ければ案内メッセージが出る", async (db, container) => {
  await createShop(db, { name: "店A", exchange_rate: "20", lending_rate: "20" });
  await createMachine(db, { name: "北斗の拳" }); // 未対応機種

  await renderSettingTool(container, db, new URLSearchParams(""));
  assert.match(container.textContent, /対応している機種がまだ登録されていません/);
  assert.equal(container.querySelector("#f-machine-id").disabled, true);
});

await test("設定判別ツール: 対応機種（戦国乙女5）だけが機種セレクトに出る", async (db, container) => {
  await createShop(db, { name: "店B", exchange_rate: "20", lending_rate: "20" });
  await createMachine(db, { name: "北斗の拳" });
  await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingTool(container, db, new URLSearchParams(""));
  const machineSelect = container.querySelector("#f-machine-id");
  const optionTexts = Array.from(machineSelect.options).map((o) => o.textContent);
  assert.ok(optionTexts.includes("L戦国乙女5 業火を穿つ宿焔の双刃"));
  assert.ok(!optionTexts.includes("北斗の拳"));
});

await test("設定判別ツール: 店舗・機種を選ぶと記録一覧（空）と新規登録リンクが出る", async (db, container) => {
  const shopId = await createShop(db, { name: "店C", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingTool(container, db, new URLSearchParams(`shop_id=${shopId}&machine_id=${machineId}`));
  assert.match(container.textContent, /まだこの店舗・機種の記録はありません/);
  assert.ok(container.querySelector('a[href*="/setting-tool/new"]'));
});

// ---------------------------------------------------------------------------
await test("観測記録フォーム: 新規登録すると保存され、一覧に反映される", async (db, container) => {
  const shopId = await createShop(db, { name: "店D", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-play-date").value = "2026-09-30";
  container.querySelector("#f-game-count").value = "1000";
  container.querySelector("#f-at-count").value = "4";
  container.querySelector("#f-miko-reach-count").value = "20";
  container.querySelector("#f-cz-win-count").value = "5";
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].game_count, 1000);
  assert.equal(observations[0].at_count, 4);
  assert.equal(observations[0].machine_key, "sengoku_otome5");
});

await test("観測記録フォーム: 入力すると推定パネルがその場で更新される", async (db, container) => {
  const shopId = await createShop(db, { name: "店E", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  const panel = container.querySelector("#estimate-panel");
  assert.match(panel.textContent, /データ無し/); // 初期状態（0G）

  container.querySelector("#f-game-count").value = "1000";
  container.querySelector("#f-at-count").value = "4";
  fireEvent(container.querySelector("#f-game-count"), "input");
  fireEvent(container.querySelector("#f-at-count"), "input");

  assert.match(panel.textContent, /AT初当たり実測/);
  assert.doesNotMatch(panel.textContent, /AT初当たり実測：データ無し/);
});

await test("観測記録フォーム: 終了画面スタンプで「極」を選ぶと設定6濃厚の示唆が出る", async (db, container) => {
  const shopId = await createShop(db, { name: "店F", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-max-ending-stamp").value = "kiwami";
  fireEvent(container.querySelector("#f-max-ending-stamp"), "change");

  assert.match(container.querySelector("#estimate-panel").textContent, /設定6以上が濃厚/);
});

await test("観測記録フォーム: 編集・削除ができる", async (db, container) => {
  const shopId = await createShop(db, { name: "店G", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-play-date").value = "2026-09-30";
  container.querySelector("#f-game-count").value = "500";
  container.querySelector("#f-at-count").value = "2";
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  let observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 1);
  const observationId = observations[0].id;

  await renderSettingObservationForm(container, db, { observationId });
  container.querySelector("#f-game-count").value = "600";
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].game_count, 600);

  await renderSettingObservationForm(container, db, { observationId });
  container.querySelector("#delete-btn").click();
  await wait();

  observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 0);
});

await test("観測記録フォーム: AT当選回数が通常ゲーム数を超えるとエラーになる", async (db, container) => {
  const shopId = await createShop(db, { name: "店H", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-game-count").value = "10";
  container.querySelector("#f-at-count").value = "20";
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  assert.match(container.textContent, /AT当選回数が通常ゲーム数を超えています/);
  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 0);
});

await test("観測記録フォーム: 周期メモを追加すると自動保存され、何周期目で当たったか表示される", async (db, container) => {
  const shopId = await createShop(db, { name: "店I", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-period-game").value = "100";
  container.querySelector("#period-miss-btn").click();
  await wait();
  container.querySelector("#f-period-game").value = "50";
  container.querySelector("#period-hit-btn").click();
  await wait();

  assert.match(container.querySelector("#period-log").textContent, /初当たり1回目：2周期目/);
  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 1, "新規でも1件目の追加で自動作成され、2件目以降は同じ記録を更新する");
  assert.deepEqual(observations[0].period_log, [
    { display_game: 100, hit: false, via: null, linked_miko_id: null },
    { display_game: 50, hit: true, via: null, linked_miko_id: null },
  ]);
});

await test("観測記録フォーム: 巫女ポイント0で乙女アタック当選すると、周期メモも区切られ次は1周期目に戻る", async (db, container) => {
  const shopId = await createShop(db, { name: "店K", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-period-game").value = "100";
  container.querySelector("#period-miss-btn").click();
  await wait();
  container.querySelector("#f-period-game").value = "80";
  container.querySelector("#period-miss-btn").click();
  await wait();
  container.querySelector("#f-miko-total-game").value = "500";
  container.querySelector("#miko-win-btn").click();
  await wait();

  assert.match(container.querySelector("#period-log").textContent, /初当たり1回目：3周期目/);
  assert.match(container.querySelector("#period-log").textContent, /乙女アタック/);
  assert.equal(container.querySelector("#period-current").textContent, "（次は1周期目）");

  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].period_log.length, 3);
  const lastPeriod = observations[0].period_log[2];
  assert.equal(lastPeriod.hit, true);
  assert.equal(lastPeriod.via, "miko");
  assert.equal(typeof lastPeriod.linked_miko_id, "number");
  assert.equal(observations[0].miko_log[0].id, lastPeriod.linked_miko_id);

  // ×で当選メモを取り消すと、周期メモ側の自動区切りも一緒に消えて元に戻る。
  container.querySelector('.miko-del[data-index="0"]').click();
  await wait();
  assert.equal(container.querySelector("#period-current").textContent, "（次は3周期目）");
  const after = await listSettingObservations(db, { shopId, machineId });
  assert.equal(after[0].period_log.length, 2);
  assert.equal(after[0].miko_log.length, 0);
});

await test("観測記録フォーム: 通常ゲーム数と総ゲーム数を分けて記録できる。総ゲーム数が通常を下回るとエラー", async (db, container) => {
  const shopId = await createShop(db, { name: "店L", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-game-count").value = "1000";
  container.querySelector("#f-total-game-count").value = "1200";
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  let observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].game_count, 1000);
  assert.equal(observations[0].total_game_count, 1200);

  await renderSettingObservationForm(container, db, { observationId: observations[0].id });
  container.querySelector("#f-total-game-count").value = "500";
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  assert.match(container.textContent, /総ゲーム数が通常ゲーム数を下回っています/);
});

await test("観測記録フォーム: 巫女ポイント0メモから到達回数・CZ当選回数が自動集計される（カンスケ中は除外）", async (db, container) => {
  const shopId = await createShop(db, { name: "店J", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-miko-total-game").value = "320";
  container.querySelector("#miko-win-btn").click();
  await wait();
  container.querySelector("#f-miko-total-game").value = "780";
  container.querySelector("#miko-lose-btn").click();
  await wait();
  container.querySelector("#f-miko-total-game").value = "1100";
  container.querySelector("#f-miko-kansuke").checked = true;
  container.querySelector("#miko-win-btn").click();
  await wait();

  assert.equal(container.querySelector("#f-miko-reach-count").value, "2");
  assert.equal(container.querySelector("#f-cz-win-count").value, "1");
  assert.equal(container.querySelector("#f-miko-reach-count").readOnly, true);

  let observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].miko_log.length, 3);
  assert.equal(observations[0].miko_reach_count, 2);

  // ×で1件削除 → 自動保存
  container.querySelector('.miko-del[data-index="0"]').click();
  await wait();
  observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].miko_log.length, 2);
  assert.equal(observations[0].cz_win_count, 0);
});

await test("観測記録フォーム: ストラップの＋−と示唆チェックが自動保存され、推定パネルに反映される", async (db, container) => {
  const shopId = await createShop(db, { name: "店K", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector('.strap-plus[data-key="nobunaga"]').click();
  await wait();
  container.querySelector('.strap-plus[data-key="nobunaga"]').click();
  await wait();
  container.querySelector('.strap-minus[data-key="nobunaga"]').click();
  await wait();
  container.querySelector('.strap-plus[data-key="hideyoshi"]').click();
  await wait();
  assert.equal(container.querySelector("#strap-count-nobunaga").textContent, "1");

  const cb = container.querySelector('.hint-flag[value="haruruna_push"]');
  cb.checked = true;
  fireEvent(cb, "change");
  await wait();

  const panel = container.querySelector("#estimate-panel").textContent;
  assert.match(panel, /設定4以上が濃厚/);
  assert.match(panel, /ハルルナPUSH/);
  assert.match(panel, /出現：2回/);

  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 1);
  assert.deepEqual(observations[0].strap_counts, { nobunaga: 1, hideyoshi: 1 });
  assert.deepEqual(observations[0].hint_flags, ["haruruna_push"]);
  assert.equal(observations[0].bonus_direct_count, null, "ボーナス直撃は空欄のままならnull（数えていない）");
});

console.log(`\n${passCount} 件成功`);
