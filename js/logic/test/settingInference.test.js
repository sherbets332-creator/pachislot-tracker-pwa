/**
 * 設定判別の簡易ベイズ推定ロジックのテスト（DB非依存）。
 *
 * 実行: node js/logic/test/settingInference.test.js
 */
import assert from "node:assert/strict";
import { estimateSettingLikelihoods } from "../settingInference.js";
import { buildEstimate, AT_PROBABILITY, CZ_WIN_RATE } from "../settingReference/sengokuOtome5.js";
import { getReferenceByMachineName, getReferenceByKey } from "../settingReference/index.js";

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

// ---------------------------------------------------------------------------
test("estimateSettingLikelihoods: データが無ければ均等分布（1/6ずつ）", () => {
  const likelihoods = estimateSettingLikelihoods([{ k: 0, n: 0, rates: AT_PROBABILITY }]);
  assert.equal(likelihoods.length, 6);
  for (const l of likelihoods) assert.ok(Math.abs(l - 1 / 6) < 1e-9);
});

test("estimateSettingLikelihoods: 常に合計が1になる", () => {
  const likelihoods = estimateSettingLikelihoods([{ k: 3, n: 1000, rates: AT_PROBABILITY }]);
  const total = likelihoods.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test("estimateSettingLikelihoods: 高設定の理論値そのままの観測なら、その設定の尤度が最も高くなる", () => {
  // 設定6の理論確率どおりに10000試行して2679回成功した、という「設定6っぽい」データ
  const n = 10000;
  const k = Math.round(n * AT_PROBABILITY[5]);
  const likelihoods = estimateSettingLikelihoods([{ k, n, rates: AT_PROBABILITY }]);
  const maxIndex = likelihoods.indexOf(Math.max(...likelihoods));
  assert.equal(maxIndex, 5); // 設定6（インデックス5）
});

test("estimateSettingLikelihoods: 低設定の理論値そのままの観測なら、その設定の尤度が最も高くなる", () => {
  const n = 10000;
  const k = Math.round(n * AT_PROBABILITY[0]);
  const likelihoods = estimateSettingLikelihoods([{ k, n, rates: AT_PROBABILITY }]);
  const maxIndex = likelihoods.indexOf(Math.max(...likelihoods));
  assert.equal(maxIndex, 0); // 設定1
});

test("estimateSettingLikelihoods: 複数サンプルを組み合わせると、どちらか一方だけより分布が偏る（情報が増える）", () => {
  const n = 10000;
  const kAt = Math.round(n * AT_PROBABILITY[5]);
  const onlyAt = estimateSettingLikelihoods([{ k: kAt, n, rates: AT_PROBABILITY }]);

  const mikoN = 50;
  const czK = Math.round(mikoN * CZ_WIN_RATE[5]);
  const combined = estimateSettingLikelihoods([
    { k: kAt, n, rates: AT_PROBABILITY },
    { k: czK, n: mikoN, rates: CZ_WIN_RATE },
  ]);

  // 設定6である確信度（尤度）が、情報が増えたことでonlyAtと同じか、それ以上に高くなる
  assert.ok(combined[5] >= onlyAt[5] - 1e-6);
});

// ---------------------------------------------------------------------------
test("buildEstimate（戦国乙女5）: データが無ければ均等分布かつ示唆なし", () => {
  const est = buildEstimate({});
  assert.equal(est.likelihoods.length, 6);
  for (const l of est.likelihoods) assert.ok(Math.abs(l - 1 / 6) < 1e-9);
  assert.equal(est.hintMinSetting, null);
  assert.equal(est.observedAtRate, null);
  assert.equal(est.observedCzRate, null);
});

test("buildEstimate（戦国乙女5）: 実測値（出現率）が計算される", () => {
  const est = buildEstimate({ game_count: 1000, at_count: 4, miko_reach_count: 20, cz_win_count: 5 });
  assert.equal(est.observedAtRate, 4 / 1000);
  assert.equal(est.observedCzRate, 5 / 20);
});

test("buildEstimate（戦国乙女5）: 終了画面スタンプ「極」なら設定6濃厚の示唆になる", () => {
  const est = buildEstimate({ max_ending_stamp: "kiwami" });
  assert.equal(est.hintMinSetting, 6);
});

test("buildEstimate（戦国乙女5）: 「666枚OVER」表示でも設定6濃厚の示唆になる", () => {
  const est = buildEstimate({ max_payout_over: "p666" });
  assert.equal(est.hintMinSetting, 6);
});

test("buildEstimate（戦国乙女5）: スタンプと枚数表示、より高い方の示唆を採用する", () => {
  const est = buildEstimate({ max_ending_stamp: "ka", max_payout_over: "p444" }); // 可(2以上) vs 444枚OVER(4以上)
  assert.equal(est.hintMinSetting, 4);
});

// ---------------------------------------------------------------------------
test("getReferenceByMachineName: 正式名「L戦国乙女5 業火を穿つ宿焔の双刃」で見つかる", () => {
  const ref = getReferenceByMachineName("L戦国乙女5 業火を穿つ宿焔の双刃");
  assert.ok(ref);
  assert.equal(ref.MACHINE_KEY, "sengoku_otome5");
});

test("getReferenceByMachineName: 旧名「戦国乙女5」（別名）でも見つかる", () => {
  const ref = getReferenceByMachineName("戦国乙女5");
  assert.ok(ref);
  assert.equal(ref.MACHINE_KEY, "sengoku_otome5");
});

test("getReferenceByMachineName: 未対応機種はnull", () => {
  assert.equal(getReferenceByMachineName("北斗の拳"), null);
});

test("getReferenceByKey: キーからも見つかる", () => {
  const ref = getReferenceByKey("sengoku_otome5");
  assert.ok(ref);
  assert.equal(ref.MACHINE_NAME, "L戦国乙女5 業火を穿つ宿焔の双刃");
});

console.log(`\n${passCount} 件成功`);
