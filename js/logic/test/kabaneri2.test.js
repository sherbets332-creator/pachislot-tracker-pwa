/**
 * カバネリ海門決戦の設定判別ロジック（DB非依存）。
 * 実行: node js/logic/test/kabaneri2.test.js
 */
import assert from "node:assert/strict";
import {
  BONUS_FIRST_PROBABILITY,
  ST_PROBABILITY,
  LOWER_BELL_PROBABILITY,
  PERIOD3_BONUS_RATE,
  PERIOD4_BONUS_RATE,
  KAGE_URA_RATE,
  buildEstimate,
  summarizePeriodStats,
} from "../settingReference/kabaneri2.js";
import { getReferenceByMachineName } from "../settingReference/index.js";

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

test("カバネリ海門決戦: 設定差の数値表はすべて設定1〜6の6要素", () => {
  for (const rates of [
    BONUS_FIRST_PROBABILITY,
    ST_PROBABILITY,
    LOWER_BELL_PROBABILITY,
    PERIOD3_BONUS_RATE,
    PERIOD4_BONUS_RATE,
    KAGE_URA_RATE,
  ]) {
    assert.equal(rates.length, 6);
  }
});

test("カバネリ海門決戦: 高設定寄りの実測値では高設定側の尤度が上がる", () => {
  const gameCount = 100000;
  const estimate = buildEstimate({
    game_count: gameCount,
    bonus_count: Math.round(gameCount * BONUS_FIRST_PROBABILITY[5]),
    st_count: Math.round(gameCount * ST_PROBABILITY[5]),
    bell_count: Math.round(gameCount * LOWER_BELL_PROBABILITY[5]),
  });
  const low = estimate.likelihoods.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const high = estimate.likelihoods.slice(3).reduce((sum, value) => sum + value, 0);
  assert.ok(high > low);
  assert.ok(estimate.likelihoods[5] > estimate.likelihoods[0]);
});

test("カバネリ海門決戦: 空欄は推定から外し、入力した0回はサンプルに含める", () => {
  const blank = buildEstimate({ game_count: 1000, bonus_count: "", st_count: null, bell_count: undefined });
  assert.deepEqual(blank.samples, []);

  const zero = buildEstimate({ game_count: 1000, bonus_count: 0, st_count: "", bell_count: "" });
  assert.equal(zero.samples.length, 1);
  assert.equal(zero.samples[0].key, "bonus_first");
  assert.equal(zero.samples[0].k, 0);
});

test("カバネリ海門決戦: 周期ごとの到達・当選を集計し、当選後は1周期目へ戻る", () => {
  const summary = summarizePeriodStats([
    { display_game: 100, hit: false },
    { display_game: 200, hit: false },
    { display_game: 300, hit: true },
    { display_game: 100, hit: false },
    { display_game: 200, hit: false },
    { display_game: 300, hit: false },
    { display_game: 400, hit: true },
    { display_game: 100, hit: false },
  ]);
  assert.deepEqual(summary.byPeriod.find((row) => row.period === 3), {
    period: 3,
    reachCount: 2,
    hitCount: 1,
    hitRate: 0.5,
  });
  assert.deepEqual(summary.byPeriod.find((row) => row.period === 4), {
    period: 4,
    reachCount: 1,
    hitCount: 1,
    hitRate: 1,
  });
  assert.equal(summary.currentPeriod, 2);
});

test("カバネリ海門決戦: 正式名と別名でリファレンスを取得できる", () => {
  assert.equal(getReferenceByMachineName("スマスロ 甲鉄城のカバネリ 海門(うなと)決戦")?.MACHINE_KEY, "kabaneri2_unato");
  assert.equal(getReferenceByMachineName("カバネリ海門決戦")?.MACHINE_KEY, "kabaneri2_unato");
  assert.equal(getReferenceByMachineName("甲鉄城のカバネリ 海門決戦")?.MACHINE_KEY, "kabaneri2_unato");
});

console.log(`\n${passCount} 件成功`);
