/**
 * 匿名書き出し（店舗名・台番号・メモ・正確な日付を含めない）のテスト。
 * 実行: node js/logic/test/anonymousExport.test.js
 */
import assert from "node:assert/strict";
import {
  buildAnonymousObservationExport,
  buildAnonymousExportFilename,
  toYearMonth,
  EXCLUDED_FIELDS,
} from "../anonymousExport.js";
import * as sengokuOtome5 from "../settingReference/sengokuOtome5.js";

let passCount = 0;
function test(name, fn) {
  fn();
  passCount += 1;
  console.log(`OK   ${name}`);
}

const observation = {
  id: 12,
  shop_id: 3,
  machine_id: 4,
  machine_key: "sengoku_otome5",
  play_date: "2026-10-03",
  machine_number: "656",
  memo: "グランキコーナ大阪本店 656番 朝からいい感じ",
  game_count: 2816,
  at_count: 11,
  hint_flags: ["a"],
  period_log: [{ display_game: 100, hit: false }],
  created_at: "2026-10-03T10:00:00Z",
  updated_at: "2026-10-03T12:00:00Z",
};

test("toYearMonth: 日付を年月だけにする。不正なら null", () => {
  assert.equal(toYearMonth("2026-10-03"), "2026-10");
  assert.equal(toYearMonth(""), null);
  assert.equal(toYearMonth("2026/10/03"), null);
});

test("店舗ID・台番号・メモ・日付・ID・時刻が書き出しに含まれない", () => {
  const estimate = sengokuOtome5.buildEstimate({ game_count: 2816, at_count: 11 });
  const exported = buildAnonymousObservationExport(observation, sengokuOtome5, estimate);
  const text = JSON.stringify(exported);
  for (const field of EXCLUDED_FIELDS) {
    assert.equal(field in exported.observation, false, `${field} が残っている`);
  }
  assert.ok(!text.includes("グランキコーナ"));
  assert.ok(!text.includes("656"));
  assert.ok(!text.includes("2026-10-03"));
  assert.equal(exported.play_year_month, "2026-10");
});

test("判別の材料と推定結果は残る", () => {
  const estimate = sengokuOtome5.buildEstimate({ game_count: 2816, at_count: 11 });
  const exported = buildAnonymousObservationExport(observation, sengokuOtome5, estimate);
  assert.equal(exported.machine_key, "sengoku_otome5");
  assert.equal(exported.observation.game_count, 2816);
  assert.equal(exported.observation.at_count, 11);
  assert.deepEqual(exported.observation.period_log, [{ display_game: 100, hit: false }]);
  assert.equal(exported.estimate.likelihood_percent.length, 6);
  assert.ok(exported.estimate.samples.length > 0);
});

test("実際の設定（答え合わせ用）は書き出しに残る", () => {
  const exported = buildAnonymousObservationExport({ ...observation, actual_setting: 3 }, sengokuOtome5, null);
  assert.equal(exported.observation.actual_setting, 3);
});

test("元の観測記録オブジェクトは書き換えない", () => {
  buildAnonymousObservationExport(observation, sengokuOtome5, null);
  assert.equal(observation.shop_id, 3);
  assert.equal(observation.memo.includes("グランキコーナ"), true);
});

test("ファイル名は pachislot-export- で始まる（.gitignore対象）", () => {
  const exported = buildAnonymousObservationExport(observation, sengokuOtome5, null);
  assert.equal(buildAnonymousExportFilename(exported), "pachislot-export-observation-sengoku_otome5-2026-10.json");
});

console.log(`\n${passCount} 件成功`);
