/**
 * 東京喰種の設定判別ロジック（DB非依存）。
 * 実行: node js/logic/test/tokyoGhoul.test.js
 */
import assert from "node:assert/strict";
import {
  AT_PROBABILITY,
  CZ_REMINISCENCE_PROBABILITY,
  CZ_RIZE_PROBABILITY,
  CZ_COMBINED_PROBABILITY,
  EPISODE_BONUS_PROBABILITY,
  CZ_WITHIN_100_RATE,
  REPLAY_DIRECT_PROBABILITY,
  PULLBACK_RATE,
  LOWER_REPLAY_PROBABILITY,
  PAYOUT_RATE,
  buildEstimate,
  summarizeResultLog,
} from "../settingReference/tokyoGhoul.js";
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

test("東京喰種: 数値表はすべて設定1〜6の6要素", () => {
  for (const rates of [
    AT_PROBABILITY,
    CZ_REMINISCENCE_PROBABILITY,
    CZ_RIZE_PROBABILITY,
    CZ_COMBINED_PROBABILITY,
    EPISODE_BONUS_PROBABILITY,
    CZ_WITHIN_100_RATE,
    REPLAY_DIRECT_PROBABILITY,
    PULLBACK_RATE,
    LOWER_REPLAY_PROBABILITY,
    PAYOUT_RATE,
  ]) {
    assert.equal(rates.length, 6);
  }
});

test("東京喰種: 高設定寄りの実測値では高設定側の尤度が上がる", () => {
  const gameCount = 200000;
  const estimate = buildEstimate({
    game_count: gameCount,
    at_count: Math.round(gameCount * AT_PROBABILITY[5]),
    cz_remi_count: Math.round(gameCount * CZ_REMINISCENCE_PROBABILITY[5]),
    cz_rize_count: Math.round(gameCount * CZ_RIZE_PROBABILITY[5]),
    episode_count: Math.round(gameCount * EPISODE_BONUS_PROBABILITY[5]),
    replay_direct_count: Math.round(gameCount * REPLAY_DIRECT_PROBABILITY[5]),
    lower_replay_count: Math.round(gameCount * LOWER_REPLAY_PROBABILITY[5]),
  });
  const low = estimate.likelihoods.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const high = estimate.likelihoods.slice(3).reduce((sum, value) => sum + value, 0);
  assert.ok(high > low);
  assert.ok(estimate.likelihoods[5] > estimate.likelihoods[0]);
});

test("東京喰種: 空欄は推定から外し、入力した0回はサンプルに含める", () => {
  const blank = buildEstimate({
    game_count: 1000,
    at_count: "",
    cz_remi_count: null,
    cz_rize_count: undefined,
    episode_count: "",
    replay_direct_count: "",
    lower_replay_count: "",
  });
  assert.deepEqual(blank.samples, []);

  const zero = buildEstimate({ game_count: 1000, at_count: 0 });
  assert.equal(zero.samples.length, 1);
  assert.equal(zero.samples[0].key, "at");
  assert.equal(zero.samples[0].k, 0);
});

test("東京喰種: 成否ログの総件数・当選件数・当選率を集計する", () => {
  assert.deepEqual(summarizeResultLog([]), { totalCount: 0, winCount: 0, winRate: null });
  assert.deepEqual(summarizeResultLog([{ win: true }, { win: false }, { win: true }]), {
    totalCount: 3,
    winCount: 2,
    winRate: 2 / 3,
  });

  const estimate = buildEstimate({
    cz100_log: [{ win: true }, { win: false }],
    pullback_log: [{ win: false }, { win: true }, { win: false }],
  });
  assert.equal(estimate.samples.find((sample) => sample.key === "cz100").n, 2);
  assert.equal(estimate.samples.find((sample) => sample.key === "pullback").k, 1);
});

test("東京喰種: 設定示唆からhintMinSettingが変わり、参考示唆は確定扱いしない", () => {
  assert.equal(buildEstimate({ hint_flags: ["cz_end_owl"] }).hintMinSetting, 4);
  assert.equal(buildEstimate({ hint_flags: ["at_end_anteiku_all"] }).hintMinSetting, 6);
  const referenceOnly = buildEstimate({ hint_flags: ["cz_end_juuzou"] });
  assert.equal(referenceOnly.hintMinSetting, null);
  assert.match(referenceOnly.referenceHintSources[0], /偶数設定示唆/);
});

test("東京喰種: 正式名と別名でリファレンスを取得できる", () => {
  assert.equal(getReferenceByMachineName("L 東京喰種")?.MACHINE_KEY, "tokyo_ghoul");
  assert.equal(getReferenceByMachineName("東京喰種")?.MACHINE_KEY, "tokyo_ghoul");
  assert.equal(getReferenceByMachineName("スマスロ 東京喰種")?.MACHINE_KEY, "tokyo_ghoul");
  assert.equal(getReferenceByMachineName("L東京喰種")?.MACHINE_KEY, "tokyo_ghoul");
});

console.log(`\n${passCount} 件成功`);
