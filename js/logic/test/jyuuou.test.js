/**
 * スマスロ 獣王の設定判別ロジック（DB非依存）。設定は1,2,4,5,6の5段階（設定3なし）。
 * 実行: node js/logic/test/jyuuou.test.js
 */
import assert from "node:assert/strict";
import {
  MACHINE_KEY,
  MACHINE_NAME,
  MACHINE_ALIASES,
  NONEXISTENT_SETTING_INDEXES,
  SC_PROBABILITY,
  CHANCE_EYE_WIN_RATE,
  MONGOOSE_LEFT_RATE,
  SETTING_HINTS,
  scTrialGames,
  buildEstimate,
} from "../settingReference/jyuuou.js";
import { buildEstimateWithHints, summarizeEstimateHeadline } from "../settingInference.js";
import { getReferenceByMachineName, getReferenceByKey } from "../settingReference/index.js";
import * as jyuuou from "../settingReference/jyuuou.js";

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`OK   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test("数値表: 長さ6で、設定3（インデックス2）だけがnull。出典の数値と一致する", () => {
  for (const table of [SC_PROBABILITY, CHANCE_EYE_WIN_RATE, MONGOOSE_LEFT_RATE]) {
    assert.equal(table.length, 6);
    assert.equal(table[2], null);
    assert.ok(table.filter((_, i) => i !== 2).every((v) => v > 0));
  }
  assert.deepEqual(NONEXISTENT_SETTING_INDEXES, [2]);
  assert.equal(Math.round(1 / SC_PROBABILITY[0] * 10) / 10, 326.5);
  assert.equal(Math.round(1 / SC_PROBABILITY[5] * 10) / 10, 279.7);
  assert.deepEqual(CHANCE_EYE_WIN_RATE, [0.008, 0.008, null, 0.023, 0.027, 0.031]);
  assert.deepEqual(MONGOOSE_LEFT_RATE, [0.6, 0.4, null, 0.4, 0.6, 0.5]);
});

test("機種名・別名で引ける", () => {
  assert.equal(getReferenceByMachineName(MACHINE_NAME).MACHINE_KEY, MACHINE_KEY);
  for (const alias of MACHINE_ALIASES) assert.equal(getReferenceByMachineName(alias).MACHINE_KEY, MACHINE_KEY);
  assert.equal(getReferenceByKey("jyuuou"), jyuuou);
});

test("scTrialGames: SC1回につき29Gを分母から除き、下限は0", () => {
  assert.equal(scTrialGames(3000, 10), 3000 - 290);
  assert.equal(scTrialGames(100, 10), 0);
  assert.equal(scTrialGames(1000, 0), 1000);
});

test("buildEstimate: 設定3は常に尤度0で、残り5設定の合計が1", () => {
  const e = buildEstimate({ game_count: 3000, sc_count: 12 });
  assert.equal(e.likelihoods[2], 0);
  assert.ok(Math.abs(sum(e.likelihoods) - 1) < 1e-9);
  const noData = buildEstimate({ game_count: 0 });
  assert.equal(noData.likelihoods[2], 0);
  assert.ok(Math.abs(sum(noData.likelihoods) - 1) < 1e-9);
  assert.ok(Math.abs(noData.likelihoods[0] - 0.2) < 1e-9);
});

test("buildEstimate: SC初当たりが多いと高設定側（設定6）の尤度が上がる／少ないと設定1側", () => {
  const high = buildEstimate({ game_count: 5000, sc_count: 20 }); // 1/250程度
  assert.ok(high.likelihoods[5] > high.likelihoods[0]);
  const low = buildEstimate({ game_count: 5000, sc_count: 12 }); // 1/417程度
  assert.ok(low.likelihoods[0] > low.likelihoods[5]);
});

test("buildEstimate: 空欄は計算に使わず、0は計算する", () => {
  const blank = buildEstimate({ game_count: 3000, sc_count: "" });
  assert.equal(blank.samples.length, 0);
  const zero = buildEstimate({ game_count: 3000, sc_count: "0" });
  assert.equal(zero.samples.length, 1);
  assert.equal(zero.samples[0].k, 0);
  assert.ok(zero.likelihoods[0] > zero.likelihoods[5], "SCが0回なら低設定側に寄る");
});

test("buildEstimate: チャンス目直撃は、チャンス目の成立回数が0・空欄なら使わず、超過は例外", () => {
  assert.equal(buildEstimate({ game_count: 100, chance_eye_count: "", chance_eye_win_count: "" }).samples.length, 0);
  assert.equal(buildEstimate({ game_count: 100, chance_eye_count: 0 }).samples.length, 0);
  const e = buildEstimate({ game_count: 3000, chance_eye_count: 40, chance_eye_win_count: 2 });
  assert.equal(e.samples.find((s) => s.key === "chance_eye_win").n, 40);
  assert.throws(() => buildEstimate({ game_count: 3000, chance_eye_count: 5, chance_eye_win_count: 6 }), /超えています/);
  assert.throws(() => buildEstimate({ game_count: 3000, chance_eye_win_count: 1 }), /超えています/);
});

test("buildEstimate: マングースの向き。左が多いと設定1・5寄り、右が多いと設定2・4寄り。設定3は0", () => {
  const left = buildEstimate({ game_count: 100, mongoose_left_count: 12, mongoose_right_count: 3 });
  assert.ok(left.likelihoods[0] > left.likelihoods[1]);
  assert.ok(left.likelihoods[4] > left.likelihoods[3]);
  const right = buildEstimate({ game_count: 100, mongoose_left_count: 3, mongoose_right_count: 12 });
  assert.ok(right.likelihoods[1] > right.likelihoods[0]);
  assert.ok(right.likelihoods[3] > right.likelihoods[4]);
  assert.equal(left.likelihoods[2], 0);
  assert.equal(right.likelihoods[2], 0);
});

test("示唆: サミートロフィーの虹で設定6濃厚→バーが設定6に固定。銅は設定2以上の表示のみ", () => {
  const rainbow = buildEstimateWithHints(jyuuou, { game_count: 3000, sc_count: 8, hint_flags: ["trophy_rainbow"] });
  assert.equal(rainbow.hintMinSetting, 6);
  assert.deepEqual(rainbow.likelihoods, [0, 0, 0, 0, 0, 1]);
  assert.equal(summarizeEstimateHeadline(rainbow), "設定6以上濃厚");
  const bronze = buildEstimateWithHints(jyuuou, { game_count: 3000, sc_count: 8, hint_flags: ["trophy_bronze"] });
  assert.equal(bronze.hintMinSetting, 2);
  assert.equal(bronze.confirmedSetting, undefined);
  assert.equal(SETTING_HINTS.some((h) => h.label === "銀"), false);
});

test("buildEstimateWithHints: 内訳でも設定3が最も出やすい設定にならず、判別力が存在する設定だけで計算される", () => {
  const e = buildEstimateWithHints(jyuuou, {
    game_count: 3000, sc_count: 9, chance_eye_count: 30, chance_eye_win_count: 1, mongoose_left_count: 5, mongoose_right_count: 5,
  });
  assert.equal(e.contributions.length, 3);
  for (const c of e.contributions) {
    assert.notEqual(c.bestIndex, 2);
    assert.equal(c.likelihoods[2], 0);
    assert.ok(Math.abs(sum(c.likelihoods) - 1) < 1e-9);
  }
  assert.deepEqual(e.nonexistentSettingIndexes, [2]);
});

test("設定Lの点滅チェック: 推定には混ぜず警告を出す。機械割の取得済みの値", () => {
  const withL = buildEstimate({ game_count: 3000, sc_count: 9, hint_flags: ["setting_l_blink"] });
  assert.equal(withL.hintMinSetting, null);
  assert.match(withL.warningMessages[0], /設定L/);
  assert.match(withL.referenceHintSources.join(""), /設定3の代わり/);
  const without = buildEstimate({ game_count: 3000, sc_count: 9 });
  assert.deepEqual(without.warningMessages, []);
  assert.deepEqual(withL.likelihoods, without.likelihoods);
  assert.deepEqual(jyuuou.PAYOUT_RATE, [0.978, 0.987, null, 1.056, 1.086, 1.143]);
});

console.log(`\n${passCount} 件成功`);
