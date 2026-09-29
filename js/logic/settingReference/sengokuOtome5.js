/**
 * 「戦国乙女5 業火を穿つ宿焔の双刃」（スマスロ）の設定判別 参考データ。
 *
 * 数値は公開されている解析サイトの情報をもとにしている（実機の公式発表値ではない場合を含む）。
 * あくまで「参考」であり、これだけで設定を断定できるものではない。
 *
 * 出典（2026-09調査時点）:
 * - https://nana-press.com/kaiseki/machine/1160/37314/
 * - https://chonborista.com/slot/orinpia-slot/256147/
 */
import { estimateSettingLikelihoods } from "../settingInference.js";

export const MACHINE_KEY = "sengoku_otome5";
export const MACHINE_NAME = "戦国乙女5";

/** 設定1〜6の順（インデックス0=設定1）。 */
export const SETTING_LABELS = ["設定1", "設定2", "設定3", "設定4", "設定5", "設定6"];

/** AT初当たり確率（ボーナス直撃＋CZ勝利の合算）。 */
export const AT_PROBABILITY = [1 / 359.5, 1 / 350.8, 1 / 332.5, 1 / 302.8, 1 / 281.0, 1 / 262.9];

/** 巫女ポイント0pt到達時のCZ「乙女アタック」当選率。 */
export const CZ_WIN_RATE = [0.203, 0.214, 0.232, 0.247, 0.252, 0.257];

/** 戦国乙女ボーナス直撃（前兆無しの即当選）の出現率。滅多に起きないため参考程度。 */
export const BONUS_DIRECT_PROBABILITY = [1 / 21206.7, 1 / 15648.9, 1 / 13143.5, 1 / 8143.4, 1 / 6427.6, 1 / 5502.7];

/** 出玉率（機械割）の目安。 */
export const PAYOUT_RATE = [0.979, 0.989, 1.010, 1.062, 1.111, 1.149];

/** AT終了画面のスタンプ。到達したスタンプ以上で、その設定以上がほぼ濃厚とされる。 */
export const ENDING_STAMPS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "ka", label: "可", minSetting: 2 },
  { value: "kichi", label: "吉", minSetting: 3 },
  { value: "ryo", label: "良", minSetting: 4 },
  { value: "yu", label: "優", minSetting: 5 },
  { value: "kiwami", label: "極", minSetting: 6 },
];

/** AT終了画面の獲得枚数表示（「◯◯◯枚OVER」）。到達すればその設定以上が濃厚。 */
export const PAYOUT_OVER_HINTS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "p222", label: "222枚OVER", minSetting: 2 },
  { value: "p333", label: "333枚OVER", minSetting: 3 },
  { value: "p444", label: "444枚OVER", minSetting: 4 },
  { value: "p555", label: "555枚OVER", minSetting: 5 },
  { value: "p666", label: "666枚OVER", minSetting: 6 },
];

function findMinSetting(options, value) {
  const found = options.find((o) => o.value === value);
  return found ? found.minSetting : null;
}

/**
 * 1回の観測記録（1セッション分の入力値）から、設定ごとの相対尤度と示唆情報をまとめて返す。
 *
 * @param {{game_count?: number, at_count?: number, miko_reach_count?: number, cz_win_count?: number,
 *           max_ending_stamp?: string, max_payout_over?: string}} obs
 */
export function buildEstimate(obs) {
  const gameCount = Number(obs.game_count) || 0;
  const atCount = Number(obs.at_count) || 0;
  const mikoReachCount = Number(obs.miko_reach_count) || 0;
  const czWinCount = Number(obs.cz_win_count) || 0;

  const samples = [
    { key: "at", label: "AT初当たり", k: atCount, n: gameCount, rates: AT_PROBABILITY },
    { key: "cz", label: "CZ（乙女アタック）当選", k: czWinCount, n: mikoReachCount, rates: CZ_WIN_RATE },
  ];

  const likelihoods = estimateSettingLikelihoods(samples);

  const stampMinSetting = findMinSetting(ENDING_STAMPS, obs.max_ending_stamp);
  const payoutMinSetting = findMinSetting(PAYOUT_OVER_HINTS, obs.max_payout_over);
  const hintMinSetting = Math.max(stampMinSetting || 0, payoutMinSetting || 0) || null;

  return {
    settingLabels: SETTING_LABELS,
    likelihoods, // 長さ6、合計1
    observedAtRate: gameCount > 0 ? atCount / gameCount : null,
    observedCzRate: mikoReachCount > 0 ? czWinCount / mikoReachCount : null,
    hintMinSetting, // スタンプ・枚数表示から言える「これ以上濃厚」の最低設定（無ければnull）
    samples,
  };
}
