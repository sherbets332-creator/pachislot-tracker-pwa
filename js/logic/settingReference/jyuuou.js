/**
 * 「スマスロ 獣王」の設定判別 参考データ。
 *
 * 設定は 1, 2, 4, 5, 6 の5段階で、**設定3は存在しない**。確率配列は長さ6のままインデックス2（設定3）に
 * null を入れ、NONEXISTENT_SETTING_INDEXES で共通ロジック（estimateSettingLikelihoods 等）に除外させる。
 *
 * 出典（2026-10調査時点）:
 * - https://nana-press.com/kaiseki/machine/1232/39329/
 * - https://chonborista.com/slot/sammy-slot/263920/
 * - https://p-town.dmm.com/machines/5061
 * - https://1geki.jp/slot/l_jyuuou/99/
 *
 * 未確認事項:
 * - SC初当たりの解析値は「SC後の29G間を分母から除外」した値。暫定的に n = game_count − 29 × sc_count
 *   （下限0）とする。マイスロの通常ゲーム数がすでに29G間を除いているかは未確認。要検証。
 * - 「チャンス目」が弱・強の合算か未確認。暫定的に画面の「チャンス目」回数（弱＋強）を入れてもらう。要検証。
 * - BIG中マングースの向きを1回のBIGで何回数えるか未確認。暫定的に見えた回数をそのまま数える。
 * - 設定L（設定3の代わりに搭載。下パネルが常時点滅。AT初当たり・機械割は非公表）は推定の対象外。
 *   点滅の有無はチェック項目にして、出たら推定が当てにならない旨を警告表示する。
 * - マイスロ中断データの項目名との対応は未確認。入力欄のラベルは仕様書どおりにしてある。
 * - レア小役のSC高確移行率・謎高確移行率は、内部状態の移行率で画面から数えられないため入力項目にしない。
 */
import { estimateSettingLikelihoods } from "../settingInference.js";

export const MACHINE_KEY = "jyuuou";
export const MACHINE_NAME = "スマスロ 獣王";
export const MACHINE_ALIASES = ["獣王", "Lスマスロ 獣王", "L 獣王", "L獣王", "スマスロ獣王"];
export const SETTING_LABELS = ["設定1", "設定2", "設定3", "設定4", "設定5", "設定6"];

/** 存在しない設定のインデックス（0始まり。2＝設定3）。 */
export const NONEXISTENT_SETTING_INDEXES = [2];

/** SC（サバンナチャンス）初当たり確率。設定3は存在しない（null）。 */
export const SC_PROBABILITY = [1 / 326.5, 1 / 321.6, null, 1 / 295.8, 1 / 287.6, 1 / 279.7];
/** チャンス目直撃時のSC・BIG・REG当選率。 */
export const CHANCE_EYE_WIN_RATE = [0.008, 0.008, null, 0.023, 0.027, 0.031];
/** BIG中のマングースが左向きになる割合（右向き＝1−左向き）。 */
export const MONGOOSE_LEFT_RATE = [0.6, 0.4, null, 0.4, 0.6, 0.5];
/** 機械割（出典: 必勝本、ななプレス等。設定3は存在しない）。 */
export const PAYOUT_RATE = [0.978, 0.987, null, 1.056, 1.086, 1.143];

/** SC初当たり確率の分母から除外する、SC後のゲーム数。 */
export const SC_EXCLUDED_GAMES = 29;

export const ENDING_STAMPS = [];
export const PAYOUT_OVER_HINTS = [];

export const SETTING_HINTS = [
  {
    value: "setting_l_blink",
    group: "設定L",
    label: "下パネルが常時点滅している（設定L）",
    note: "設定3の代わりの特殊設定。AT初当たり・機械割は非公開のため推定には使いません。点滅していたら遊技を控えるのが基本とされています。",
  },
  { value: "trophy_bronze", group: "サミートロフィー", label: "銅", minSetting: 2 },
  { value: "trophy_gold", group: "サミートロフィー", label: "金", minSetting: 4 },
  { value: "trophy_kirin", group: "サミートロフィー", label: "キリン柄", minSetting: 5 },
  { value: "trophy_rainbow", group: "サミートロフィー", label: "虹", minSetting: 6 },
];

export const SETTING_HINT_GROUP_NOTES = {
  設定L: "座る前に、筐体の下パネルが常時点滅していないか確認します。",
  サミートロフィー: "初回SC終了時、リール上部液晶の右側に表示されます（サバ連中は出ません。銀は出現しません）。",
};

export const ESTIMATE_DESCRIPTION =
  "SC初当たり・チャンス目直撃・BIG中マングースの向きの理論値に対して、入力した実測値がどれくらい起こりやすいかを設定1・2・4・5・6で相対比較した簡易的な目安です（設定3は存在しません）。SC初当たりの分母（SC後の29G除外）は暫定で、要検証です。";

function isRecorded(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function optionalCount(value) {
  return isRecorded(value) ? Number(value) || 0 : null;
}

function summarizeHints(hintFlags = []) {
  const seen = SETTING_HINTS.filter((hint) => hintFlags.includes(hint.value));
  return {
    minSettingSources: seen
      .filter((hint) => hint.minSetting)
      .map((hint) => ({ label: `${hint.group}「${hint.label}」`, minSetting: hint.minSetting })),
    excludedSettings: [...new Set(seen.flatMap((hint) => hint.excludes || []))].sort((a, b) => a - b),
    referenceNotes: seen.filter((hint) => hint.note).map((hint) => `${hint.group}「${hint.label}」：${hint.note}`),
  };
}

/** SC初当たりの試行回数。SC後の29G間を除外する（要検証の暫定）。 */
export function scTrialGames(gameCount, scCount) {
  return Math.max(0, gameCount - SC_EXCLUDED_GAMES * scCount);
}

export function buildEstimate(obs) {
  const gameCount = Number(obs.game_count) || 0;
  const totalGameCount = isRecorded(obs.total_game_count) ? Number(obs.total_game_count) || 0 : null;
  const scCount = optionalCount(obs.sc_count);
  const chanceEyeCount = optionalCount(obs.chance_eye_count);
  const chanceEyeWinCount = optionalCount(obs.chance_eye_win_count);
  const mongooseLeft = optionalCount(obs.mongoose_left_count);
  const mongooseRight = optionalCount(obs.mongoose_right_count);
  const mongooseTotal = (mongooseLeft ?? 0) + (mongooseRight ?? 0);
  if (chanceEyeWinCount !== null && chanceEyeWinCount > (chanceEyeCount ?? 0)) {
    throw new RangeError("チャンス目直撃の当選回数が、チャンス目の成立回数を超えています。");
  }
  const scGames = scCount !== null ? scTrialGames(gameCount, scCount) : 0;
  const samples = [];

  if (scCount !== null) {
    samples.push({ key: "sc", label: "SC初当たり", k: scCount, n: scGames, rates: SC_PROBABILITY });
  }
  if (chanceEyeCount !== null && chanceEyeCount > 0 && chanceEyeWinCount !== null) {
    samples.push({
      key: "chance_eye_win",
      label: "チャンス目直撃（SC・BIG・REG当選）",
      k: chanceEyeWinCount,
      n: chanceEyeCount,
      rates: CHANCE_EYE_WIN_RATE,
    });
  }
  if (mongooseTotal > 0 && (mongooseLeft !== null || mongooseRight !== null)) {
    samples.push({
      key: "mongoose_left",
      label: "BIG中マングース左向き",
      k: mongooseLeft ?? 0,
      n: mongooseTotal,
      rates: MONGOOSE_LEFT_RATE,
    });
  }

  const hintSummary = summarizeHints(Array.isArray(obs.hint_flags) ? obs.hint_flags : []);
  const hintMinSetting = Math.max(0, ...hintSummary.minSettingSources.map((source) => source.minSetting)) || null;

  return {
    settingLabels: SETTING_LABELS,
    likelihoods: estimateSettingLikelihoods(samples, { excludeIndexes: NONEXISTENT_SETTING_INDEXES }),
    hintMinSetting,
    minSettingSources: hintSummary.minSettingSources,
    samples,
    totalGameCount,
    observedMetrics: [
      { label: "SC初当たり", value: scCount !== null && scGames > 0 ? scCount / scGames : null, format: "fraction" },
      {
        label: "チャンス目直撃",
        value: chanceEyeCount !== null && chanceEyeCount > 0 && chanceEyeWinCount !== null ? chanceEyeWinCount / chanceEyeCount : null,
        format: "percent",
      },
      { label: "マングース左向き", value: mongooseTotal > 0 ? (mongooseLeft ?? 0) / mongooseTotal : null, format: "percent" },
    ],
    excludedSettings: hintSummary.excludedSettings,
    referenceHintSources: hintSummary.referenceNotes,
    warningMessages: (obs.hint_flags || []).includes("setting_l_blink")
      ? ["設定Lの示唆があります。この推定は設定L（数値非公開）を含まないため、当てになりません。"]
      : [],
  };
}
