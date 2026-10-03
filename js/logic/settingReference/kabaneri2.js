/**
 * 「スマスロ 甲鉄城のカバネリ 海門(うなと)決戦」の設定判別 参考データ。
 *
 * 出典（2026-10調査時点）:
 * - https://nana-press.com/kaiseki/machine/35404/
 * - https://1geki.jp/slot/l_kabaneri2/
 *
 * 未確認事項:
 * - ボーナス初当たり・ST・下段ベルの分母が通常ゲーム数か総ゲーム数かは未確認。
 *   暫定的に3項目とも game_count（通常ゲーム数）を分母にする。要検証。
 * - 景之ST「裏」突入率の母数は「復讐の炎に成功した回数」。真景之STと裏景之STを
 *   合わせた全成功回数を入力の母数として扱う。
 * - マイスロのQR内容は未確認のため、自動取り込みは実装しない。
 */
import { estimateSettingLikelihoods } from "../settingInference.js";

export const MACHINE_KEY = "kabaneri2_unato";
export const MACHINE_NAME = "スマスロ 甲鉄城のカバネリ 海門(うなと)決戦";
export const MACHINE_ALIASES = ["カバネリ海門決戦", "甲鉄城のカバネリ 海門決戦"];
export const SETTING_LABELS = ["設定1", "設定2", "設定3", "設定4", "設定5", "設定6"];

/** 設定1〜6の順（インデックス0=設定1）。 */
export const BONUS_FIRST_PROBABILITY = [1 / 254.2, 1 / 242.3, 1 / 239.6, 1 / 214.0, 1 / 203.2, 1 / 195.1];
export const ST_PROBABILITY = [1 / 422.5, 1 / 405.9, 1 / 398.7, 1 / 357.2, 1 / 332.6, 1 / 318.5];
export const LOWER_BELL_PROBABILITY = [1 / 121.1, 1 / 114.4, 1 / 112.8, 1 / 106.2, 1 / 104.2, 1 / 99.1];
export const PERIOD3_BONUS_RATE = [0.184, 0.238, 0.211, 0.285, 0.324, 0.371];
export const PERIOD4_BONUS_RATE = [0.336, 0.352, 0.363, 0.402, 0.434, 0.469];
export const KAGE_URA_RATE = [0.062, 0.062, 0.066, 0.109, 0.25, 0.332];
export const PAYOUT_RATE = [null, null, null, null, 1.11, 1.149];

/** 参考値。設定1〜5が未取得なので推定には使わない。 */
export const CZ_SETTING6_REFERENCE = {
  combined: 1 / 157.3,
  mumei: 1 / 254.1,
  ikoma: 1 / 660.6,
  douran: 1 / 1101.0,
};

/** 差が小さいため推定には使わない。 */
export const HAYAJIRO_SINGLE_CHANCE_RATE = [0.012, 0.02, 0.02, 0.02, 0.02, 0.023];

export const ENDING_STAMPS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "mumei_ayame_swimsuit", label: "無名＋菖蒲（水着）", minSetting: 6 },
];

export const PAYOUT_OVER_HINTS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "p456", label: "456枚OVER", minSetting: 4 },
  { value: "p666", label: "666枚OVER", minSetting: 6 },
];

export const SETTING_HINTS = [
  { value: "omikuji_daikichi", group: "おみくじ", label: "大吉", minSetting: 6 },
  { value: "omikuji_chukichi", group: "おみくじ", label: "中吉", minSetting: 4 },
  { value: "omikuji_shokichi", group: "おみくじ", label: "小吉", minSetting: 2 },
  { value: "omikuji_kurusu_sword", group: "おみくじ", label: "来栖の刀", excludes: [2, 3] },
  { value: "voice_unusual", group: "ボーナス中ボイス", label: "やっぱりこの台……普通じゃないね", minSetting: 2 },
  {
    value: "voice_none",
    group: "ボーナス中ボイス",
    label: "ボイスが一度も出なかった",
    note: "設定5以上濃厚とされるが、母数不明のため参考表示のみ・要確認",
  },
  { value: "trophy_rainbow", group: "サミートロフィー", label: "虹", minSetting: 6 },
  { value: "trophy_kirin", group: "サミートロフィー", label: "キリン", minSetting: 5 },
  { value: "trophy_gold", group: "サミートロフィー", label: "金", note: "参考" },
  { value: "trophy_silver", group: "サミートロフィー", label: "銀", note: "参考" },
  { value: "trophy_bronze", group: "サミートロフィー", label: "銅", note: "参考" },
];

export const ESTIMATE_DESCRIPTION =
  "ボーナス初当たり・ST・下段ベル・周期3/4・裏景之STの理論値に対して、入力した実測値がどれくらい起こりやすいかを設定1〜6で相対比較した簡易的な目安です。断定はできません。";

function isRecorded(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function optionalCount(value) {
  return isRecorded(value) ? Number(value) || 0 : null;
}

function findMinSetting(options, value) {
  return options.find((option) => option.value === value)?.minSetting ?? null;
}

/**
 * 周期メモを「N周期目への到達回数・そこでのボーナス当選回数」に集計する。
 * 当選後は次のエントリを1周期目として数え直す。
 */
export function summarizePeriodStats(periodLog = []) {
  const counters = new Map();
  const hits = [];
  let current = [];
  let currentPeriod = 1;

  for (const entry of periodLog) {
    if (!counters.has(currentPeriod)) counters.set(currentPeriod, { period: currentPeriod, reachCount: 0, hitCount: 0 });
    const counter = counters.get(currentPeriod);
    counter.reachCount += 1;
    current.push(entry);
    if (entry.hit) {
      counter.hitCount += 1;
      hits.push({ period: currentPeriod, entries: current });
      current = [];
      currentPeriod = 1;
    } else {
      currentPeriod += 1;
    }
  }

  const byPeriod = [...counters.values()]
    .sort((a, b) => a.period - b.period)
    .map((row) => ({ ...row, hitRate: row.reachCount > 0 ? row.hitCount / row.reachCount : null }));
  return { byPeriod, hits, ongoing: current, currentPeriod };
}

export function summarizeKageLog(kageLog = []) {
  const totalCount = kageLog.length;
  const uraCount = kageLog.filter((entry) => entry.ura).length;
  return { totalCount, uraCount, uraRate: totalCount > 0 ? uraCount / totalCount : null };
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

export function buildEstimate(obs) {
  // 要検証: 仕様確定までは初当たり・ST・下段ベルの3つとも通常ゲーム数を分母にする。
  const gameCount = Number(obs.game_count) || 0;
  const totalRaw = obs.total_game_count;
  const totalGameCount = isRecorded(totalRaw) ? Number(totalRaw) || 0 : null;
  const bonusCount = optionalCount(obs.bonus_count);
  const stCount = optionalCount(obs.st_count);
  const bellCount = optionalCount(obs.bell_count);
  const periodSummary = summarizePeriodStats(Array.isArray(obs.period_log) ? obs.period_log : []);
  const kageSummary = summarizeKageLog(Array.isArray(obs.kage_log) ? obs.kage_log : []);
  const samples = [];

  if (bonusCount !== null) samples.push({ key: "bonus_first", label: "ボーナス初当たり", k: bonusCount, n: gameCount, rates: BONUS_FIRST_PROBABILITY });
  if (stCount !== null) samples.push({ key: "st", label: "ST初当たり", k: stCount, n: gameCount, rates: ST_PROBABILITY });
  if (bellCount !== null) samples.push({ key: "lower_bell", label: "下段ベル", k: bellCount, n: gameCount, rates: LOWER_BELL_PROBABILITY });

  const period3 = periodSummary.byPeriod.find((row) => row.period === 3);
  if (period3?.reachCount > 0) {
    samples.push({ key: "period3", label: "3周期目ボーナス当選", k: period3.hitCount, n: period3.reachCount, rates: PERIOD3_BONUS_RATE });
  }
  const period4 = periodSummary.byPeriod.find((row) => row.period === 4);
  if (period4?.reachCount > 0) {
    samples.push({ key: "period4", label: "4周期目ボーナス当選", k: period4.hitCount, n: period4.reachCount, rates: PERIOD4_BONUS_RATE });
  }
  if (kageSummary.totalCount > 0) {
    samples.push({ key: "kage_ura", label: "裏景之ST突入", k: kageSummary.uraCount, n: kageSummary.totalCount, rates: KAGE_URA_RATE });
  }

  const likelihoods = estimateSettingLikelihoods(samples);
  const hintSummary = summarizeHints(Array.isArray(obs.hint_flags) ? obs.hint_flags : []);
  const minSettingSources = [...hintSummary.minSettingSources];
  const stampMinSetting = findMinSetting(ENDING_STAMPS, obs.max_ending_stamp);
  if (stampMinSetting) {
    const stamp = ENDING_STAMPS.find((item) => item.value === obs.max_ending_stamp);
    minSettingSources.push({ label: `ST終了画面「${stamp.label}」`, minSetting: stampMinSetting });
  }
  const payoutMinSetting = findMinSetting(PAYOUT_OVER_HINTS, obs.max_payout_over);
  if (payoutMinSetting) {
    const payout = PAYOUT_OVER_HINTS.find((item) => item.value === obs.max_payout_over);
    minSettingSources.push({ label: `獲得枚数表示「${payout.label}」`, minSetting: payoutMinSetting });
  }
  const hintMinSetting = Math.max(0, ...minSettingSources.map((source) => source.minSetting)) || null;

  return {
    settingLabels: SETTING_LABELS,
    likelihoods,
    hintMinSetting,
    minSettingSources,
    samples,
    totalGameCount,
    observedMetrics: [
      { label: "ボーナス初当たり", value: bonusCount !== null && gameCount > 0 ? bonusCount / gameCount : null, format: "fraction" },
      { label: "ST初当たり", value: stCount !== null && gameCount > 0 ? stCount / gameCount : null, format: "fraction" },
      { label: "下段ベル", value: bellCount !== null && gameCount > 0 ? bellCount / gameCount : null, format: "fraction" },
      { label: "3周期目当選", value: period3?.hitRate ?? null, format: "percent" },
      { label: "4周期目当選", value: period4?.hitRate ?? null, format: "percent" },
      { label: "裏景之ST", value: kageSummary.uraRate, format: "percent" },
    ],
    periodSummary,
    kageSummary,
    excludedSettings: hintSummary.excludedSettings,
    referenceHintSources: hintSummary.referenceNotes,
  };
}
