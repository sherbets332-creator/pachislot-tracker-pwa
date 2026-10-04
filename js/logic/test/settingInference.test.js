/**
 * 設定判別の簡易ベイズ推定ロジックのテスト（DB非依存）。
 *
 * 実行: node js/logic/test/settingInference.test.js
 */
import assert from "node:assert/strict";
import {
  estimateSettingLikelihoods,
  summarizeEstimateHeadline,
  applyConfirmedSetting,
  summarizeSampleContributions,
  buildEstimateWithHints,
} from "../settingInference.js";
import {
  buildEstimate,
  AT_PROBABILITY,
  CZ_WIN_RATE,
  summarizePeriodLog,
  summarizeMikoLog,
  summarizeAtCzLog,
} from "../settingReference/sengokuOtome5.js";
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

// ---------------------------------------------------------------------------
test("summarizePeriodLog: 当選ごとに何周期目かを数え、進行中の周期も返す", () => {
  const s = summarizePeriodLog([
    { display_game: 100, hit: false },
    { display_game: 50, hit: true }, // 2周期目で当選
    { display_game: 200, hit: true }, // 1周期目で当選
    { display_game: 100, hit: false }, // 進行中
  ]);
  assert.deepEqual(s.hits.map((h) => h.period), [2, 1]);
  assert.equal(s.ongoing.length, 1);
  assert.equal(s.currentPeriod, 2);
  assert.equal(s.averageHitPeriod, 1.5);
  assert.equal(s.firstPeriodHitRate, 0.5);
});

test("summarizePeriodLog: 空なら統計はnull・次は1周期目", () => {
  const s = summarizePeriodLog([]);
  assert.equal(s.hits.length, 0);
  assert.equal(s.currentPeriod, 1);
  assert.equal(s.averageHitPeriod, null);
});

test("summarizeMikoLog: カンスケ中は母数から除外する", () => {
  const m = summarizeMikoLog([
    { total_game: 300, won: true, kansuke: false },
    { total_game: 700, won: false, kansuke: false },
    { total_game: 900, won: true, kansuke: true },
  ]);
  assert.equal(m.reachCount, 2);
  assert.equal(m.winCount, 1);
  assert.equal(m.kansukeCount, 1);
  assert.equal(m.averageInterval, 300); // (700-300 + 900-700) / 2
});

test("summarizeMikoLog: 乙女アタック当選のうちAT当選した回数を数える（at_won未設定の旧データはAT当選扱い）", () => {
  const m = summarizeMikoLog([
    { total_game: 300, won: true, at_won: false, kansuke: false },
    { total_game: 700, won: true, at_won: true, kansuke: false },
    { total_game: 900, won: true, kansuke: false }, // 旧データ
    { total_game: 1200, won: false, at_won: false, kansuke: false },
  ]);
  assert.equal(m.winCount, 3); // CZ当選率の分子はATの成否に関係なく乙女アタック当選
  assert.equal(m.czWinTotal, 3);
  assert.equal(m.atWinCount, 2);
});

test("summarizeAtCzLog: 本能寺の変・カシンバトルを種類ごと・契機ごとに集計し、本能寺だけ突入率を出す", () => {
  const log = [
    { kind: "honnoji", trigger: "game", won: true },
    { kind: "honnoji", trigger: "game", won: false },
    { kind: "honnoji", trigger: "rare", won: true },
    { kind: "kashin", trigger: "rare", won: false },
  ];
  const [honnoji, kashin] = summarizeAtCzLog(log, { atGameCount: 300 });
  assert.equal(honnoji.count, 3);
  assert.equal(honnoji.wins, 2);
  assert.deepEqual(
    honnoji.byTrigger.map((t) => [t.trigger, t.count, t.wins]),
    [["game", 2, 1], ["rare", 1, 1]]
  );
  assert.equal(honnoji.entryRate, 3 / 300);
  assert.equal(kashin.count, 1);
  assert.equal(kashin.entryRate, null, "カシンバトルは上位ATのゲーム数が取れないので突入率を出さない");

  const [noGames] = summarizeAtCzLog(log, { atGameCount: null });
  assert.equal(noGames.entryRate, null);
});

test("summarizeMikoLog: 総G数が空欄の回は間隔計算から除外し、1件以下ならnull", () => {
  const single = summarizeMikoLog([{ total_game: 300, won: false, kansuke: false }]);
  assert.equal(single.averageInterval, null);

  const withBlank = summarizeMikoLog([
    { total_game: 300, won: false, kansuke: false },
    { total_game: null, won: false, kansuke: false },
    { total_game: 900, won: true, kansuke: false },
  ]);
  assert.equal(withBlank.averageInterval, 600); // 総G数ありの回（300→900）だけを見る
});

test("summarizeEstimateHeadline: データが無ければnull", () => {
  const e = buildEstimate({});
  assert.equal(summarizeEstimateHeadline(e), null);
});

test("summarizeEstimateHeadline: hintMinSettingがあればそれを優先して一言にする", () => {
  const e = buildEstimate({ max_ending_stamp: "kiwami", game_count: 1000, at_count: 1 });
  assert.equal(summarizeEstimateHeadline(e), "設定6以上濃厚");
});

test("summarizeEstimateHeadline: データがあれば最尤設定と割合を一言にする", () => {
  // 設定6のAT初当たり確率そのままの実測 → 設定6寄りになるはず
  const e = buildEstimate({ game_count: 10000, at_count: Math.round(10000 / 262.9) });
  const headline = summarizeEstimateHeadline(e);
  assert.match(headline, /設定6寄り（\d+%）/);
});

test("buildEstimate: 短縮天井の示唆(ceiling_reset_hint)は設定変更示唆として返すだけで、尤度には混ぜない", () => {
  const withHint = buildEstimate({ game_count: 1000, at_count: 4, ceiling_reset_hint: true });
  assert.equal(withHint.settingChangeHint, true);

  const withoutHint = buildEstimate({ game_count: 1000, at_count: 4 });
  assert.equal(withoutHint.settingChangeHint, false);
  // 短縮天井の示唆の有無で推定尤度が変わらないことを確認する。
  assert.deepEqual(withHint.likelihoods, withoutHint.likelihoods);
});

test("buildEstimate: 総ゲーム数は参考値として通すだけで、推定には使わない", () => {
  const withTotal = buildEstimate({ game_count: 1000, at_count: 4, total_game_count: 1200 });
  assert.equal(withTotal.totalGameCount, 1200);

  const withoutTotal = buildEstimate({ game_count: 1000, at_count: 4 });
  assert.equal(withoutTotal.totalGameCount, null);
  // 総ゲーム数の有無で推定尤度が変わらないことを確認する。
  assert.deepEqual(withTotal.likelihoods, withoutTotal.likelihoods);
});

test("buildEstimate: ボーナス直撃は空欄なら推定に使わず、入力すれば使う", () => {
  const blank = buildEstimate({ game_count: 3000, at_count: 10, bonus_direct_count: "" });
  assert.equal(blank.samples.some((s) => s.key === "bonus"), false);
  assert.equal(blank.observedBonusRate, null);

  const withBonus = buildEstimate({ game_count: 3000, at_count: 10, bonus_direct_count: "2" });
  assert.equal(withBonus.samples.some((s) => s.key === "bonus"), true);
  // 3000Gで直撃2回は高設定寄り → 設定6の尤度が設定1より高くなる
  assert.ok(withBonus.likelihoods[5] > withBonus.likelihoods[0]);
  // 直撃が無い場合と比べても設定6寄りに動く
  assert.ok(withBonus.likelihoods[5] > blank.likelihoods[5]);
});

test("buildEstimate: 示唆チェックから「設定◯以上濃厚」と根拠、奇数/偶数示唆が出る", () => {
  const e = buildEstimate({ hint_flags: ["voice_semedoki", "nagi_blue", "voice_kansha"], max_ending_stamp: "kichi" });
  assert.equal(e.hintMinSetting, 4);
  assert.equal(e.minSettingSources.length, 3); // ボイス・隠れ凪・スタンプ
  assert.deepEqual(e.parityHint, { odd: 1, even: 0 });
});

test("buildEstimate: 設定差ありストラップ（ノブナガ・ゴエモン・ヒデヨシ）の出現回数を合計する", () => {
  const e = buildEstimate({ strap_counts: { nobunaga: 2, goemon: 1, kansuke: 3 } });
  assert.equal(e.strapSummary.settingDiffCount, 3);
  assert.equal(e.strapSummary.totalCount, 6);
});

test("buildEstimate: 巫女メモがあれば手入力の回数よりメモの集計を使う", () => {
  const e = buildEstimate({
    game_count: 1000,
    miko_reach_count: 99,
    cz_win_count: 99,
    miko_log: [
      { total_game: 300, won: true, kansuke: false },
      { total_game: 700, won: false, kansuke: false },
      { total_game: 900, won: true, kansuke: true },
    ],
  });
  assert.equal(e.observedCzRate, 0.5);
  assert.equal(e.mikoSummary.kansukeCount, 1);
});

test("applyConfirmedSetting: 設定6濃厚の示唆があるときだけ、確率を設定6に固定し、元の推定を残す", () => {
  const base = { settingLabels: ["1","2","3","4","5","6"], likelihoods: [0.3, 0.2, 0.2, 0.1, 0.1, 0.1], hintMinSetting: 6, samples: [] };
  const confirmed = applyConfirmedSetting(base);
  assert.deepEqual(confirmed.likelihoods, [0, 0, 0, 0, 0, 1]);
  assert.deepEqual(confirmed.rawLikelihoods, [0.3, 0.2, 0.2, 0.1, 0.1, 0.1]);
  assert.equal(confirmed.confirmedSetting, 6);
});

test("applyConfirmedSetting: 設定4以上などの範囲のある示唆や、示唆なしでは変えない", () => {
  const base = { settingLabels: ["1","2","3","4","5","6"], likelihoods: [0.3, 0.2, 0.2, 0.1, 0.1, 0.1], hintMinSetting: 4, samples: [] };
  assert.equal(applyConfirmedSetting(base), base);
  const none = { ...base, hintMinSetting: null };
  assert.equal(applyConfirmedSetting(none), none);
});

test("summarizeSampleContributions: AT初当たりが設定6寄りなら6寄り・サンプルが少なければ判別力は弱い", () => {
  const rates = AT_PROBABILITY;
  const [strong] = summarizeSampleContributions([{ key: "at", label: "AT", k: 40, n: 6000, rates }]);
  assert.equal(strong.bestIndex, 5);
  assert.notEqual(strong.strength, "weak");
  const [weak] = summarizeSampleContributions([{ key: "at", label: "AT", k: 1, n: 300, rates }]);
  assert.equal(weak.strength, "weak");
  assert.equal(summarizeSampleContributions([{ label: "x", k: 0, n: 0, rates }]).length, 0);
});

test("buildEstimateWithHints: 内訳が付き、6濃厚（終了画面極）で確率が6に固定される。示唆なしなら変わらない", () => {
  const ref = getReferenceByKey("sengoku_otome5");
  const plain = buildEstimateWithHints(ref, { game_count: 4365, at_count: 19, miko_reach_count: 30, cz_win_count: 7 });
  assert.equal(plain.contributions.length, plain.samples.length);
  assert.equal(plain.confirmedSetting, undefined);
  const withStamp = buildEstimateWithHints(ref, { game_count: 4365, at_count: 19, miko_reach_count: 30, cz_win_count: 7, max_ending_stamp: "kiwami" });
  assert.deepEqual(withStamp.likelihoods, [0, 0, 0, 0, 0, 1]);
  assert.equal(withStamp.rawLikelihoods.length, 6);
  assert.equal(summarizeEstimateHeadline(withStamp), "設定6以上濃厚");
});

console.log(`\n${passCount} 件成功`);
