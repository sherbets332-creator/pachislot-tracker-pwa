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
global.DOMParser = dom.window.DOMParser;
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

await test("設定判別ツール: 未登録の対応機種をボタン1つで正式名のまま登録できる（登録済み・別名は重複しない）", async (db, container) => {
  const { listAllMachines } = await import("../../repository.js");
  await createMachine(db, { name: "東京喰種" }); // 別名で登録済み → 登録対象に出ない
  await renderSettingTool(container, db, new URLSearchParams(""));
  const card = container.querySelector("#register-machines-card");
  assert.ok(card);
  assert.ok(!card.textContent.includes("L 東京喰種"));
  assert.match(card.textContent, /カバネリ/);

  container.querySelector("#register-machines-btn").click();
  await new Promise((resolve) => setTimeout(resolve, 100));

  const names = (await listAllMachines(db)).map((m) => m.name);
  assert.ok(names.includes("スマスロ 甲鉄城のカバネリ 海門(うなと)決戦"));
  assert.ok(names.includes("L戦国乙女5 業火を穿つ宿焔の双刃"));
  assert.equal(names.filter((n) => n.includes("東京喰種")).length, 1);
  assert.equal(container.querySelector("#register-machines-card"), null);
  const optionTexts = Array.from(container.querySelector("#f-machine-id").options).map((o) => o.textContent);
  assert.ok(optionTexts.includes("スマスロ 甲鉄城のカバネリ 海門(うなと)決戦"));
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
  assert.match(container.querySelector("#estimate-panel").textContent, /設定6以上濃厚/); // 追加した総合サマリー行
});

await test("設定判別ツール: 記録一覧に簡易推定の一言サマリーが出る", async (db, container) => {
  const shopId = await createShop(db, { name: "店M", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-max-ending-stamp").value = "kiwami";
  fireEvent(container.querySelector("#f-max-ending-stamp"), "change");
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  await renderSettingTool(container, db, new URLSearchParams(`shop_id=${shopId}&machine_id=${machineId}`));
  assert.match(container.textContent, /設定6以上濃厚/);
});

await test("観測記録フォーム: 短縮天井（設定変更示唆）にチェックすると推定パネルと一覧に出る", async (db, container) => {
  const shopId = await createShop(db, { name: "店N", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-ceiling-reset-hint").checked = true;
  fireEvent(container.querySelector("#f-ceiling-reset-hint"), "change");
  await wait();

  assert.match(container.querySelector("#estimate-panel").textContent, /設定変更（据え置きではない）の示唆があります/);

  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].ceiling_reset_hint, true);

  await renderSettingTool(container, db, new URLSearchParams(`shop_id=${shopId}&machine_id=${machineId}`));
  assert.match(container.textContent, /設定変更の示唆あり/);
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

await test("観測記録フォーム: 乙女アタック当選でもATを取れなければ周期は区切られない（CZ当選には数える）", async (db, container) => {
  const shopId = await createShop(db, { name: "店M", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-period-game").value = "100";
  container.querySelector("#period-miss-btn").click();
  await wait();
  container.querySelector("#f-miko-total-game").value = "150";
  container.querySelector("#miko-cz-only-btn").click();
  await wait();

  assert.equal(container.querySelector("#period-current").textContent, "（次は2周期目）");
  assert.equal(container.querySelector("#f-cz-win-count").value, "1");
  assert.match(container.querySelector("#miko-log").textContent, /AT取れず/);
  assert.match(container.querySelector("#miko-log").textContent, /乙女アタック当選1回のうちAT当選0回/);

  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].period_log.length, 1);
  assert.equal(observations[0].miko_log[0].won, true);
  assert.equal(observations[0].miko_log[0].at_won, false);

  // 削除しても周期メモ側は影響を受けない
  container.querySelector('.miko-del[data-index="0"]').click();
  await wait();
  const after = await listSettingObservations(db, { shopId, machineId });
  assert.equal(after[0].period_log.length, 1);
  assert.equal(after[0].miko_log.length, 0);
});

await test("観測記録フォーム: AT中CZメモ（本能寺の変・カシンバトル）を契機付きで記録し、突入率の目安が出る", async (db, container) => {
  const shopId = await createShop(db, { name: "店N", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-game-count").value = "1000";
  container.querySelector("#f-total-game-count").value = "1230";

  // 契機・AT中G数は共通の入力欄。種類はボタンで決まる（1ブロックにまとめた形）
  container.querySelector("#f-atcz-trigger").value = "rare";
  container.querySelector("#f-atcz-game").value = "45";
  container.querySelector('.atcz-btn[data-kind="honnoji"][data-won="1"]').click();
  await wait();
  container.querySelector("#f-atcz-trigger").value = "game";
  container.querySelector('.atcz-btn[data-kind="honnoji"][data-won="0"]').click();
  await wait();
  container.querySelector("#f-atcz-trigger").value = "mitsuhide"; // 真強カワラッシュ中の高確
  container.querySelector('.atcz-btn[data-kind="kashin"][data-won="1"]').click();
  await wait();

  const honnojiText = container.querySelector("#atcz-summary-honnoji").textContent;
  assert.match(honnojiText, /2回中1勝/);
  assert.match(honnojiText, /レア役 1回中1勝/);
  assert.match(honnojiText, /突入率（目安）：1\/115\.0/); // 230G / 2回、総1230−通常1000
  const kashinText = container.querySelector("#atcz-summary-kashin").textContent;
  assert.match(kashinText, /1回中1勝/);
  assert.match(kashinText, /高確中 1回中1勝/);
  assert.doesNotMatch(kashinText, /突入率/);
  const listText = container.querySelector("#atcz-log").textContent;
  assert.match(listText, /本能寺/);
  assert.match(listText, /カシン/);
  assert.match(listText, /AT45G/);

  // 手入力のAT中ゲーム数があればそちらを使う（目安表記は消える）
  container.querySelector("#f-at-game-count").value = "400";
  fireEvent(container.querySelector("#f-at-game-count"), "input");
  assert.match(container.querySelector("#atcz-summary-honnoji").textContent, /突入率：1\/200\.0/);

  let observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].at_cz_log.length, 3);
  assert.deepEqual(
    observations[0].at_cz_log.map((e) => [e.kind, e.trigger, e.at_game, e.won]),
    [["honnoji", "rare", 45, true], ["honnoji", "game", null, false], ["kashin", "mitsuhide", null, true]]
  );

  // ×で削除（3件目＝カシンバトル） → 自動保存
  container.querySelectorAll("#atcz-log .atcz-del")[2].click();
  await wait();
  observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].at_cz_log.length, 2);
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

// ---------------------------------------------------------------------------
const DWIN_SAMPLE_HTML = `<!doctype html><html><body>
  <table class="table2"><tbody>
    <tr><td>総ゲーム数</td><td>6,326 ゲーム</td></tr>
    <tr><td>通常ゲーム数</td><td>3,290 ゲーム</td></tr>
    <tr><td>戦国乙女ボーナス回数（確率）</td><td>1 回<br>1/3,290.0</td></tr>
  </tbody></table>
  <div class="stamp_wrapa"><div class="stamp_wrapa_item"><img class="stamp_wrapa_item_img" src="https://dwlite.heiwa.jp/img/yu.png" /></div></div>
</body></html>`;

await test("観測記録フォーム: 打-WINのURLを読み込むと通常ゲーム数・総ゲーム数・終了画面スタンプが反映される", async (db, container) => {
  const shopId = await createShop(db, { name: "店O", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => DWIN_SAMPLE_HTML });
  try {
    container.querySelector("#f-dwin-url").value = "https://dwlite.heiwa.jp/ps/dummy";
    container.querySelector("#dwin-load-btn").click();
    await wait();
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(container.querySelector("#f-game-count").value, "3290");
  assert.equal(container.querySelector("#f-total-game-count").value, "6326");
  assert.equal(container.querySelector("#f-max-ending-stamp").value, "yu");
  assert.match(container.querySelector("#dwin-status").textContent, /反映しました/);
  assert.match(container.querySelector("#dwin-reference").textContent, /戦国乙女ボーナス回数/);
  // 推定パネルも読み込んだ通常ゲーム数を反映して更新されているはず。
  assert.doesNotMatch(container.querySelector("#estimate-panel").textContent, /AT初当たり実測：データ無し/);
});

await test("観測記録フォーム: 打-WINの読み込みに失敗するとエラーメッセージが出る", async (db, container) => {
  const shopId = await createShop(db, { name: "店P", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId });

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404 });
  try {
    container.querySelector("#f-dwin-url").value = "https://dwlite.heiwa.jp/ps/invalid";
    container.querySelector("#dwin-load-btn").click();
    await wait();
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(container.querySelector("#dwin-status").textContent, /読み込めませんでした/);
});

await test("観測記録フォーム: カバネリ専用項目を表示し、戦国乙女5の既存項目は変えない", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const kabaneriId = await createMachine(db, { name: "スマスロ 甲鉄城のカバネリ 海門(うなと)決戦" });
  const otomeId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId: kabaneriId });
  assert.ok(container.querySelector("#f-bonus-count"));
  assert.ok(container.querySelector("#f-st-count"));
  assert.ok(container.querySelector("#f-bell-count"));
  assert.ok(container.querySelector("#period-card"));
  assert.ok(container.querySelector("#kage-card"));
  assert.equal(container.querySelector("#miko-card"), null);
  assert.equal(container.querySelector("#dwin-card"), null);
  assert.equal(container.querySelector("#f-at-count"), null);
  assert.match(container.textContent, /分母は未確認/);

  await renderSettingObservationForm(container, db, { shopId, machineId: otomeId });
  assert.ok(container.querySelector("#f-at-count"));
  assert.ok(container.querySelector("#f-bonus-direct-count"));
  assert.ok(container.querySelector("#miko-card"));
  assert.ok(container.querySelector("#dwin-card"));
  assert.equal(container.querySelector("#f-bonus-count"), null);
  assert.equal(container.querySelector("#kage-card"), null);
});

await test("観測記録フォーム: カバネリの手入力・周期・景之STを保存して再表示できる", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "スマスロ 甲鉄城のカバネリ 海門(うなと)決戦" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-play-date").value = "2026-10-03";
  container.querySelector("#f-game-count").value = "5000";
  container.querySelector("#f-total-game-count").value = "6200";
  container.querySelector("#f-bonus-count").value = "25";
  container.querySelector("#f-st-count").value = "16";
  container.querySelector("#f-bell-count").value = "50";

  container.querySelector("#period-miss-btn").click();
  await wait();
  container.querySelector("#period-miss-btn").click();
  await wait();
  container.querySelector("#period-hit-btn").click();
  await wait();
  container.querySelector('.kage-btn[data-ura="0"]').click();
  await wait();
  container.querySelector('.kage-btn[data-ura="1"]').click();
  await wait();

  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].machine_key, "kabaneri2_unato");
  assert.equal(observations[0].bonus_count, 25);
  assert.equal(observations[0].st_count, 16);
  assert.equal(observations[0].bell_count, 50);
  assert.equal(observations[0].period_log.length, 3);
  assert.deepEqual(observations[0].kage_log.map((entry) => entry.ura), [false, true]);

  await renderSettingObservationForm(container, db, { observationId: observations[0].id });
  assert.equal(container.querySelector("#f-bonus-count").value, "25");
  assert.equal(container.querySelector("#f-st-count").value, "16");
  assert.equal(container.querySelector("#f-bell-count").value, "50");
  assert.match(container.querySelector("#period-log").textContent, /3周期目/);
  assert.match(container.querySelector("#kage-log").textContent, /真景之ST/);
  assert.match(container.querySelector("#kage-log").textContent, /裏景之ST/);
});

await test("観測記録フォーム: 東京喰種専用項目を表示し、既存2機種の項目は変えない", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const ghoulId = await createMachine(db, { name: "L 東京喰種" });
  const kabaneriId = await createMachine(db, { name: "スマスロ 甲鉄城のカバネリ 海門(うなと)決戦" });
  const otomeId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId: ghoulId });
  for (const id of [
    "f-at-count",
    "f-cz-remi-count",
    "f-cz-rize-count",
    "f-episode-count",
    "f-replay-direct-count",
    "f-lower-replay-count",
    "cz100-card",
    "pullback-card",
  ]) {
    assert.ok(container.querySelector(`#${id}`), `${id} が表示される`);
  }
  assert.equal(container.querySelector("#f-at-count").value, "", "東京喰種のAT初当たりは未計測なら空欄");
  assert.equal(container.querySelector("#period-card"), null);
  assert.equal(container.querySelector("#kage-card"), null);
  assert.equal(container.querySelector("#miko-card"), null);
  assert.equal(container.querySelector("#dwin-card"), null);
  assert.equal(container.querySelector("#f-max-ending-stamp"), null);
  assert.match(container.textContent, /各確率の分母は未確認/);

  await renderSettingObservationForm(container, db, { shopId, machineId: kabaneriId });
  assert.ok(container.querySelector("#f-bonus-count"));
  assert.ok(container.querySelector("#period-card"));
  assert.ok(container.querySelector("#kage-card"));
  assert.equal(container.querySelector("#cz100-card"), null);

  await renderSettingObservationForm(container, db, { shopId, machineId: otomeId });
  assert.ok(container.querySelector("#f-bonus-direct-count"));
  assert.ok(container.querySelector("#miko-card"));
  assert.ok(container.querySelector("#dwin-card"));
  assert.equal(container.querySelector("#cz100-card"), null);
});

await test("観測記録フォーム: 東京喰種の手入力と成否ログを保存して再表示できる", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L 東京喰種" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-play-date").value = "2026-10-03";
  container.querySelector("#f-game-count").value = "8000";
  container.querySelector("#f-total-game-count").value = "10000";
  container.querySelector("#f-at-count").value = "30";
  container.querySelector("#f-cz-remi-count").value = "31";
  container.querySelector("#f-cz-rize-count").value = "7";
  container.querySelector("#f-episode-count").value = "3";
  container.querySelector("#f-replay-direct-count").value = "1";
  container.querySelector("#f-lower-replay-count").value = "8";

  container.querySelector('.binary-log-btn[data-log-key="cz100_log"][data-win="1"]').click();
  await wait();
  container.querySelector('.binary-log-btn[data-log-key="cz100_log"][data-win="0"]').click();
  await wait();
  container.querySelector('.binary-log-btn[data-log-key="pullback_log"][data-win="0"]').click();
  await wait();
  container.querySelector('.binary-log-btn[data-log-key="pullback_log"][data-win="1"]').click();
  await wait();

  const observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].machine_key, "tokyo_ghoul");
  assert.equal(observations[0].at_count, 30);
  assert.equal(observations[0].cz_remi_count, 31);
  assert.equal(observations[0].cz_rize_count, 7);
  assert.equal(observations[0].episode_count, 3);
  assert.equal(observations[0].replay_direct_count, 1);
  assert.equal(observations[0].lower_replay_count, 8);
  assert.deepEqual(observations[0].cz100_log.map((entry) => entry.win), [true, false]);
  assert.deepEqual(observations[0].pullback_log.map((entry) => entry.win), [false, true]);

  await renderSettingObservationForm(container, db, { observationId: observations[0].id });
  assert.equal(container.querySelector("#f-at-count").value, "30");
  assert.equal(container.querySelector("#f-cz-remi-count").value, "31");
  assert.equal(container.querySelector("#f-lower-replay-count").value, "8");
  assert.match(container.querySelector("#cz100-log").textContent, /2回中1回/);
  assert.match(container.querySelector("#pullback-log").textContent, /2回中1回/);

  container.querySelector('#cz100-log .binary-log-del[data-index="0"]').click();
  await wait();
  const afterDelete = await listSettingObservations(db, { shopId, machineId });
  assert.deepEqual(afterDelete[0].cz100_log.map((entry) => entry.win), [false]);
});

await test("観測記録フォーム: 真打 吉宗の専用項目を表示し、既存3機種の項目は変えない", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const yoshimuneId = await createMachine(db, { name: "真打 吉宗" });
  const ghoulId = await createMachine(db, { name: "L 東京喰種" });
  const kabaneriId = await createMachine(db, { name: "スマスロ 甲鉄城のカバネリ 海門(うなと)決戦" });
  const otomeId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });

  await renderSettingObservationForm(container, db, { shopId, machineId: yoshimuneId });
  for (const id of ["f-at-count", "f-cz-count", "f-direct-at-count", "f-yagyu-count", "batto-card"]) {
    assert.ok(container.querySelector(`#${id}`), `${id} が表示される`);
  }
  assert.equal(container.querySelector("#f-at-count").value, "");
  assert.ok(container.querySelector("#f-max-ending-stamp"));
  assert.ok(container.querySelector("#f-max-payout-over"));
  assert.equal(container.querySelector("#dwin-card"), null);
  assert.equal(container.querySelector("#period-card"), null);
  assert.match(container.textContent, /通常プレイ数/);
  assert.match(container.textContent, /総回数/);
  assert.match(container.textContent, /AT終了後の初回と5周期目は記録しない/);
  assert.match(container.textContent, /ポイント特化ゾーン終了時にPUSH/);

  await renderSettingObservationForm(container, db, { shopId, machineId: ghoulId });
  assert.ok(container.querySelector("#cz100-card"));
  assert.ok(container.querySelector("#pullback-card"));
  assert.equal(container.querySelector("#batto-card"), null);

  await renderSettingObservationForm(container, db, { shopId, machineId: kabaneriId });
  assert.ok(container.querySelector("#period-card"));
  assert.ok(container.querySelector("#kage-card"));
  assert.equal(container.querySelector("#batto-card"), null);

  await renderSettingObservationForm(container, db, { shopId, machineId: otomeId });
  assert.ok(container.querySelector("#miko-card"));
  assert.ok(container.querySelector("#dwin-card"));
  assert.equal(container.querySelector("#batto-card"), null);
});

await test("観測記録フォーム: 真打 吉宗の入力・抜刀ログを保存して再表示できる", async (db, container) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "真打 吉宗" });

  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-play-date").value = "2026-10-03";
  container.querySelector("#f-game-count").value = "2816";
  container.querySelector("#f-total-game-count").value = "3500";
  container.querySelector("#f-at-count").value = "11";
  container.querySelector("#f-cz-count").value = "8";
  container.querySelector("#f-yagyu-count").value = "1";

  assert.doesNotMatch(container.querySelector("#estimate-panel").textContent, /CZ直撃込みで計算/);
  container.querySelector('.binary-log-btn[data-log-key="batto_log"][data-win="1"]').click();
  await wait();
  container.querySelector('.binary-log-btn[data-log-key="batto_log"][data-win="0"]').click();
  await wait();

  let observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].machine_key, "shinuchi_yoshimune");
  assert.equal(observations[0].at_count, 11);
  assert.equal(observations[0].cz_count, 8);
  assert.equal(observations[0].direct_at_count, null);
  assert.equal(observations[0].yagyu_count, 1);
  assert.deepEqual(observations[0].batto_log.map((entry) => entry.win), [true, false]);

  await renderSettingObservationForm(container, db, { observationId: observations[0].id });
  assert.equal(container.querySelector("#f-cz-count").value, "8");
  assert.match(container.querySelector("#batto-log").textContent, /2回中1回/);

  container.querySelector("#f-direct-at-count").value = "4";
  fireEvent(container.querySelector("#f-direct-at-count"), "input");
  const panelText = container.querySelector("#estimate-panel").textContent;
  assert.match(panelText, /CZ直撃込みで計算/);
  assert.match(panelText, /どちらの定義が正しいか未確認/);
  assert.match(panelText, /直撃ATは天井やモードC周期でも起きます/);

  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();
  observations = await listSettingObservations(db, { shopId, machineId });
  assert.equal(observations[0].direct_at_count, 4);
});

await test("iPhone対策: 入力欄は16px以上・横スクロール防止・再描画パネルのスクロール固定がCSSにある", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../../../css/app.css", import.meta.url), "utf8");
  assert.match(css, /input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px/);
  assert.match(css, /html\s*\{[^}]*overflow-x:\s*hidden/);
  assert.match(css, /#estimate-panel[\s\S]*overflow-anchor:\s*none/);
});

await test("観測記録フォーム: 入力で推定パネルを描き直してもスクロール位置が動かされない", async (db, container) => {
  const shopId = await createShop(db, { name: "店スクロール", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });
  await renderSettingObservationForm(container, db, { shopId, machineId });
  let scrolledTo = null;
  let currentY = 500;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => currentY });
  Object.defineProperty(window, "scrollX", { configurable: true, get: () => 0 });
  window.scrollTo = (x, y) => { scrolledTo = y; currentY = y; };
  // 描き直しの最中にブラウザがスクロール位置を動かした状況を再現する
  const panel = container.querySelector("#estimate-panel");
  const descriptor = Object.getOwnPropertyDescriptor(window.Element.prototype, "innerHTML");
  Object.defineProperty(panel, "innerHTML", {
    configurable: true,
    get() { return descriptor.get.call(this); },
    set(value) { descriptor.set.call(this, value); currentY = 9999; },
  });
  const gameInput = container.querySelector("#f-game-count");
  gameInput.value = "300";
  fireEvent(gameInput, "input");
  await wait();
  assert.equal(scrolledTo, 500);
});

await test("観測記録フォーム: 匿名書き出し（コピー）に店舗名・台番号・メモ・正確な日付が入らない", async (db, container) => {
  const shopId = await createShop(db, { name: "秘密ホール本店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });
  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-play-date").value = "2026-10-03";
  container.querySelector("#f-machine-number").value = "656";
  container.querySelector("#f-game-count").value = "2816";
  container.querySelector("#f-at-count").value = "11";
  container.querySelector("#f-memo").value = "秘密ホール本店の656番、朝イチ";

  let copied = null;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (text) => { copied = text; } } },
  });
  container.querySelector("#anon-export-copy-btn").click();
  await wait();

  assert.ok(copied, "コピーされていない");
  assert.ok(!copied.includes("秘密ホール"));
  assert.ok(!copied.includes("656"));
  assert.ok(!copied.includes("2026-10-03"));
  const parsed = JSON.parse(copied);
  assert.equal(parsed.play_year_month, "2026-10");
  assert.equal(parsed.observation.game_count, "2816");
  assert.equal(parsed.machine_key, "sengoku_otome5");
  assert.match(container.querySelector("#anon-export-status").textContent, /コピーしました/);
});

console.log(`\n${passCount} 件成功`);await test("観測記録フォーム: 打-WINの本能寺突入回数・確率からAT中ゲーム数を逆算して入れる（手入力済みなら上書きしない）", async (db, container) => {
  const shopId = await createShop(db, { name: "店P", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });
  await renderSettingObservationForm(container, db, { shopId, machineId });
  const html = `<!doctype html><html><body><table class="table2"><tbody>
    <tr><td>総ゲーム数</td><td>7,048 ゲーム</td></tr>
    <tr><td>通常ゲーム数</td><td>4,365 ゲーム</td></tr>
    <tr><td>本能寺の変突入回数（確率）</td><td>11 回<br>1/138.5</td></tr>
  </tbody></table></body></html>`;
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => html });
  try {
    container.querySelector("#f-dwin-url").value = "https://dwlite.heiwa.jp/ps/dummy";
    container.querySelector("#dwin-load-btn").click();
    await wait();
    assert.equal(container.querySelector("#f-at-game-count").value, "1524");
    assert.match(container.querySelector("#dwin-status").textContent, /AT中ゲーム数/);

    // 手で数えた値があれば上書きしない
    container.querySelector("#f-at-game-count").value = "1600";
    container.querySelector("#dwin-load-btn").click();
    await wait();
    assert.equal(container.querySelector("#f-at-game-count").value, "1600");
  } finally {
    global.fetch = originalFetch;
  }
});

await test("観測記録フォーム: 実際の設定（任意）を保存・再表示でき、範囲外はエラー。匿名書き出しにも入る", async (db, container) => {
  const shopId = await createShop(db, { name: "店Q", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });
  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-game-count").value = "1000";
  container.querySelector("#f-actual-setting").value = "3";
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();
  const [saved] = await listSettingObservations(db, { shopId, machineId });
  assert.equal(saved.actual_setting, 3);

  await renderSettingObservationForm(container, db, { observationId: saved.id });
  assert.equal(container.querySelector("#f-actual-setting").value, "3");

  // 未入力＝不明（null）。範囲外（7）はエラー。
  const { updateSettingObservation } = await import("../../repository.js");
  const baseForm = { machine_key: "sengoku_otome5", shop_id: shopId, machine_id: machineId, play_date: "2026-10-03", game_count: "1000" };
  await updateSettingObservation(db, saved.id, { ...baseForm, actual_setting: "" });
  const [cleared] = await listSettingObservations(db, { shopId, machineId });
  assert.equal(cleared.actual_setting, null);
  await assert.rejects(() => updateSettingObservation(db, saved.id, { ...baseForm, actual_setting: "7" }), /1〜6/);
});

await test("観測記録フォーム: 打-WINの参考データを保存し、開き直しても表示される（推定には使わない）", async (db, container) => {
  const shopId = await createShop(db, { name: "店R", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });
  await renderSettingObservationForm(container, db, { shopId, machineId });
  const html = `<!doctype html><html><body><table class="table2"><tbody>
    <tr><td>総ゲーム数</td><td>6,326 ゲーム</td></tr>
    <tr><td>通常ゲーム数</td><td>3,290 ゲーム</td></tr>
    <tr><td>本能寺の変突入回数（確率）</td><td>22 回<br>1/97.9</td></tr>
    <tr><td>出陣ボーナス回数（確率）</td><td>16 回<br>1/134.6</td></tr>
  </tbody></table></body></html>`;
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => html });
  try {
    container.querySelector("#f-dwin-url").value = "https://dwlite.heiwa.jp/ps/dummy";
    container.querySelector("#dwin-load-btn").click();
    await wait();
  } finally {
    global.fetch = originalFetch;
  }
  container.querySelector("#f-actual-setting").value = "5";
  fireEvent(container.querySelector("#observation-form"), "submit");
  await wait();

  const [saved] = await listSettingObservations(db, { shopId, machineId });
  assert.deepEqual(saved.dwin_rows, [
    { label: "本能寺の変突入回数（確率）", value: "22 回 / 1/97.9" },
    { label: "出陣ボーナス回数（確率）", value: "16 回 / 1/134.6" },
  ]);
  assert.equal(saved.actual_setting, 5);

  await renderSettingObservationForm(container, db, { observationId: saved.id });
  assert.match(container.querySelector("#dwin-reference").textContent, /保存済みの打-WINデータ/);
  assert.match(container.querySelector("#dwin-reference").textContent, /本能寺の変突入回数（確率）：22 回 \/ 1\/97\.9/);
});

await test("観測記録フォーム: 戦国乙女5のAT当選回数は周期メモのAT当選の件数に同期し、周期メモが空なら手入力できる", async (db, container) => {
  const shopId = await createShop(db, { name: "店S", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });
  await renderSettingObservationForm(container, db, { shopId, machineId });

  const atInput = container.querySelector("#f-at-count");
  assert.equal(atInput.readOnly, false, "周期メモが無ければ手入力できる");

  container.querySelector("#f-period-game").value = "100";
  container.querySelector("#period-miss-btn").click();
  await wait();
  assert.equal(atInput.readOnly, true);
  assert.equal(atInput.value, "0");

  container.querySelector("#f-period-game").value = "50";
  container.querySelector("#period-hit-btn").click();
  await wait();
  container.querySelector("#f-period-game").value = "120";
  container.querySelector("#period-hit-btn").click();
  await wait();
  assert.equal(atInput.value, "2");

  const [saved] = await listSettingObservations(db, { shopId, machineId });
  assert.equal(saved.at_count, 2, "同期した値が保存される");

  // 取り消すと件数も戻り、全部消せば手入力に戻る
  container.querySelector("#period-undo-btn").click();
  await wait();
  assert.equal(atInput.value, "1");
  container.querySelector("#period-undo-btn").click();
  await wait();
  container.querySelector("#period-undo-btn").click();
  await wait();
  assert.equal(atInput.readOnly, false);
});

await test("観測記録フォーム: 推定パネルに要素ごとの内訳が出て、設定6濃厚（終了画面「極」）ならバーが設定6に固定される", async (db, container) => {
  const shopId = await createShop(db, { name: "店T", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "L戦国乙女5 業火を穿つ宿焔の双刃" });
  await renderSettingObservationForm(container, db, { shopId, machineId });
  container.querySelector("#f-game-count").value = "4365";
  container.querySelector("#f-at-count").value = "19";
  fireEvent(container.querySelector("#f-game-count"), "input");
  await wait();
  let panel = container.querySelector("#estimate-panel").textContent;
  assert.match(panel, /要素ごとの内訳/);
  assert.match(panel, /AT初当たり/);
  assert.match(panel, /判別力/);
  assert.ok(!panel.includes("に固定しています"));

  container.querySelector("#f-max-ending-stamp").value = "kiwami";
  fireEvent(container.querySelector("#f-max-ending-stamp"), "change");
  await wait();
  panel = container.querySelector("#estimate-panel").textContent;
  assert.match(panel, /設定6濃厚の示唆があるため、上のバーは設定6に固定しています/);
  assert.match(panel, /設定6以上濃厚/);
});


