/**
 * 真打 吉宗の設定判別ロジック（DB非依存）。
 * 実行: node js/logic/test/shinuchiYoshimune.test.js
 */
import assert from "node:assert/strict";
import {
  AT_PROBABILITY,
  CZ_PROBABILITY,
  BATTO_RATE,
  YAGYU_RATE,
  PAYOUT_RATE,
  buildEstimate,
  summarizeResultLog,
} from "../settingReference/shinuchiYoshimune.js";
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

test("真打 吉宗: 数値表はすべて設定1〜6の6要素", () => {
  for (const rates of [AT_PROBABILITY, CZ_PROBABILITY, BATTO_RATE, YAGYU_RATE, PAYOUT_RATE]) {
    assert.equal(rates.length, 6);
  }
});

test("真打 吉宗: 高設定寄りの実測値では高設定側の尤度が上がる", () => {
  const gameCount = 200000;
  const estimate = buildEstimate({
    game_count: gameCount,
    at_count: Math.round(gameCount * AT_PROBABILITY[5]),
    cz_count: Math.round(gameCount * CZ_PROBABILITY[5]),
    yagyu_count: Math.round(Math.round(gameCount * CZ_PROBABILITY[5]) * YAGYU_RATE[5]),
    batto_log: Array.from({ length: 1000 }, (_, index) => ({ win: index < Math.round(1000 * BATTO_RATE[5]) })),
  });
  const low = estimate.likelihoods.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const high = estimate.likelihoods.slice(3).reduce((sum, value) => sum + value, 0);
  assert.ok(high > low);
  assert.ok(estimate.likelihoods[5] > estimate.likelihoods[0]);
});

test("真打 吉宗: 空欄は推定から外し、入力した0回はサンプルに含める", () => {
  const blank = buildEstimate({ game_count: 1000, at_count: "", cz_count: null, yagyu_count: undefined });
  assert.deepEqual(blank.samples, []);

  const zero = buildEstimate({ game_count: 1000, at_count: 0, cz_count: "", yagyu_count: "" });
  assert.equal(zero.samples.length, 1);
  assert.equal(zero.samples[0].key, "at");
  assert.equal(zero.samples[0].k, 0);
});

test("真打 吉宗: 柳生回数がCZ総回数を超える入力は弾く", () => {
  assert.throws(() => buildEstimate({ cz_count: 3, yagyu_count: 4 }), /柳生回数がCZ総回数を超えています/);
});

test("真打 吉宗: 抜刀ログを集計し、推定サンプルに使う", () => {
  const log = [{ win: true }, { win: false }, { win: true }];
  assert.deepEqual(summarizeResultLog(log), { totalCount: 3, winCount: 2, winRate: 2 / 3 });
  const estimate = buildEstimate({ batto_log: log });
  assert.deepEqual(
    { k: estimate.samples[0].k, n: estimate.samples[0].n },
    { k: 2, n: 3 }
  );
});

test("真打 吉宗: 確定示唆だけhintMinSettingに反映し、未確認トロフィーは参考に留める", () => {
  assert.equal(buildEstimate({ max_ending_stamp: "oo_oku" }).hintMinSetting, 5);
  assert.equal(buildEstimate({ max_payout_over: "p666" }).hintMinSetting, 6);
  assert.equal(buildEstimate({ hint_flags: ["voice_echizen_4"] }).hintMinSetting, 4);
  const trophy = buildEstimate({ hint_flags: ["trophy_rainbow"] });
  assert.equal(trophy.hintMinSetting, null);
  assert.match(trophy.referenceHintSources[0], /未確認/);
});

test("真打 吉宗: 直撃AT入力時だけCZ直撃込みの代替推定を返し、主推定は変えない", () => {
  const base = buildEstimate({ game_count: 3000, at_count: 10, cz_count: 8, yagyu_count: 1, direct_at_count: "" });
  assert.deepEqual(base.alternativeEstimates, []);
  assert.deepEqual(base.warningMessages, []);

  const withDirect = buildEstimate({ game_count: 3000, at_count: 10, cz_count: 8, yagyu_count: 1, direct_at_count: 4 });
  assert.deepEqual(withDirect.likelihoods, base.likelihoods);
  assert.equal(withDirect.alternativeEstimates.length, 1);
  assert.equal(withDirect.alternativeEstimates[0].label, "CZ直撃込みで計算");
  assert.match(withDirect.alternativeEstimates[0].note, /未確認/);
  assert.equal(withDirect.warningMessages.length, 1);
});

test("真打 吉宗: 正式名と別名でリファレンスを取得できる", () => {
  for (const name of ["真打 吉宗", "真打吉宗", "スマスロ 真打吉宗", "L真打 吉宗", "Ｌ真打 吉宗", "スマスロ 真打 吉宗"]) {
    assert.equal(getReferenceByMachineName(name)?.MACHINE_KEY, "shinuchi_yoshimune");
  }
});

console.log(`\n${passCount} 件成功`);
