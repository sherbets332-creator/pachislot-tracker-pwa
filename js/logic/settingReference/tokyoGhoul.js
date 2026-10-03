/**
 * 「L 東京喰種」の設定判別 参考データ。
 *
 * 出典（2026-10調査時点）:
 * - https://nana-press.com/kaiseki/machine/889/27002/
 * - https://nana-press.com/kaiseki/machine/889/27249/
 *
 * 未確認事項:
 * - AT初当たり・CZ・エピソードボーナス・リプレイ直撃・下段リプレイの分母が
 *   通常ゲーム数か総ゲーム数かは未確認。暫定的にすべて game_count を使う。要検証。
 * - 「100G以内のCZ当選率」が何の後の100Gかは未確認。暫定的に、利用者が対象と
 *   判断した区間ごとの成否を cz100_log に記録する。要検証。
 * - AT引き戻し率の母数は未確認。暫定的にAT終了1回を1試行として pullback_log に記録する。
 * - QR・公式データページの有無と内容は未確認のため、自動取り込みは実装しない。
 */
import { estimateSettingLikelihoods } from "../settingInference.js";

export const MACHINE_KEY = "tokyo_ghoul";
export const MACHINE_NAME = "L 東京喰種";
export const MACHINE_ALIASES = ["東京喰種", "スマスロ 東京喰種", "L東京喰種"];
export const SETTING_LABELS = ["設定1", "設定2", "設定3", "設定4", "設定5", "設定6"];

/** 設定1〜6の順（インデックス0=設定1）。 */
export const AT_PROBABILITY = [1 / 394.4, 1 / 380.5, 1 / 357.0, 1 / 325.9, 1 / 291.2, 1 / 261.3];
export const CZ_REMINISCENCE_PROBABILITY = [1 / 300.5, 1 / 295.1, 1 / 287.6, 1 / 276.7, 1 / 262.7, 1 / 251.2];
export const CZ_RIZE_PROBABILITY = [1 / 2079.1, 1 / 1906.5, 1 / 1722.8, 1 / 1478.9, 1 / 1226.6, 1 / 1074.9];
/** レミニセンスと大喰いの利世を個別に入力するため、合算値は参考表示用で推定には重ねて使わない。 */
export const CZ_COMBINED_PROBABILITY = [1 / 262.6, 1 / 255.6, 1 / 246.5, 1 / 233.1, 1 / 216.4, 1 / 203.7];
export const EPISODE_BONUS_PROBABILITY = [1 / 6620.2, 1 / 5879.7, 1 / 5114.5, 1 / 4062.5, 1 / 3166.7, 1 / 2639.5];
export const CZ_WITHIN_100_RATE = [0.1958, 0.2104, 0.2315, 0.2637, 0.3196, 0.3601];
export const REPLAY_DIRECT_PROBABILITY = [1 / 28460.6, 1 / 24453.5, 1 / 18093.0, 1 / 12019.5, 1 / 8615.4, 1 / 7036.8];
export const PULLBACK_RATE = [0.0781, 0.0781, 0.0938, 0.1094, 0.125, 0.1523];
export const LOWER_REPLAY_PROBABILITY = [1 / 1260.3, 1 / 1213.6, 1 / 1170.3, 1 / 1129.9, 1 / 1092.3, 1 / 1024.0];
export const PAYOUT_RATE = [0.975, 0.99, 1.016, 1.056, 1.103, 1.149];

export const ENDING_STAMPS = [];
export const PAYOUT_OVER_HINTS = [];

export const SETTING_HINTS = [
  { value: "cz_end_juuzou", group: "CZ終了画面", label: "鈴屋什造", note: "偶数設定示唆（参考）" },
  { value: "cz_end_owl", group: "CZ終了画面", label: "フクロウ", minSetting: 4 },
  { value: "cz_end_arima", group: "CZ終了画面", label: "有馬貴将", minSetting: 6 },
  { value: "at_end_anteiku_all", group: "AT終了画面", label: "アンテイク全員", minSetting: 6 },
  { value: "invitation_enjoy", group: "月山招待状", label: "存分に楽しもうじゃないか", minSetting: 4 },
  { value: "invitation_special", group: "月山招待状", label: "特別な夜を楽しもうじゃないか", minSetting: 6 },
];

/** 画面が同じ形の成否ログを機種固有の文言で描画するための定義。 */
export const BINARY_LOGS = [
  {
    key: "cz100_log",
    idPrefix: "cz100",
    title: "100G以内CZメモ",
    description: "正確な定義は未確認です。対象と判断した区間ごとに記録してください（要検証）。",
    winLabel: "100G以内にCZ当選",
    loseLabel: "100G以内にCZ外れ",
    summaryLabel: "100G以内CZ",
  },
  {
    key: "pullback_log",
    idPrefix: "pullback",
    title: "AT引き戻しメモ",
    description: "母数は未確認です。暫定的にAT終了1回ごとの引き戻し結果を記録します（要検証）。",
    winLabel: "引き戻し当選",
    loseLabel: "引き戻し失敗",
    summaryLabel: "AT引き戻し",
  },
];

export const ESTIMATE_DESCRIPTION =
  "AT初当たり・CZ・エピソードボーナス・リプレイ直撃・下段リプレイ・100G以内CZ・AT引き戻しの理論値に対して、入力した実測値がどれくらい起こりやすいかを設定1〜6で相対比較した簡易的な目安です。断定はできません。";

function isRecorded(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function optionalCount(value) {
  return isRecorded(value) ? Number(value) || 0 : null;
}

export function summarizeResultLog(log = []) {
  const totalCount = log.length;
  const winCount = log.filter((entry) => entry.win).length;
  return { totalCount, winCount, winRate: totalCount > 0 ? winCount / totalCount : null };
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
  // 要検証: 分母が確定するまでは、ゲーム数基準の全項目で通常ゲーム数を使う。
  const gameCount = Number(obs.game_count) || 0;
  const totalGameCount = isRecorded(obs.total_game_count) ? Number(obs.total_game_count) || 0 : null;
  const atCount = optionalCount(obs.at_count);
  const remiCount = optionalCount(obs.cz_remi_count);
  const rizeCount = optionalCount(obs.cz_rize_count);
  const episodeCount = optionalCount(obs.episode_count);
  const replayDirectCount = optionalCount(obs.replay_direct_count);
  const lowerReplayCount = optionalCount(obs.lower_replay_count);
  const cz100Summary = summarizeResultLog(Array.isArray(obs.cz100_log) ? obs.cz100_log : []);
  const pullbackSummary = summarizeResultLog(Array.isArray(obs.pullback_log) ? obs.pullback_log : []);
  const samples = [];

  if (atCount !== null) samples.push({ key: "at", label: "AT初当たり", k: atCount, n: gameCount, rates: AT_PROBABILITY });
  if (remiCount !== null) samples.push({ key: "cz_reminiscence", label: "CZ レミニセンス", k: remiCount, n: gameCount, rates: CZ_REMINISCENCE_PROBABILITY });
  if (rizeCount !== null) samples.push({ key: "cz_rize", label: "上位CZ 大喰いの利世", k: rizeCount, n: gameCount, rates: CZ_RIZE_PROBABILITY });
  if (episodeCount !== null) samples.push({ key: "episode_bonus", label: "エピソードボーナス", k: episodeCount, n: gameCount, rates: EPISODE_BONUS_PROBABILITY });
  if (replayDirectCount !== null) samples.push({ key: "replay_direct", label: "リプレイからのAT直撃", k: replayDirectCount, n: gameCount, rates: REPLAY_DIRECT_PROBABILITY });
  if (lowerReplayCount !== null) samples.push({ key: "lower_replay", label: "下段リプレイ", k: lowerReplayCount, n: gameCount, rates: LOWER_REPLAY_PROBABILITY });
  if (cz100Summary.totalCount > 0) samples.push({ key: "cz100", label: "100G以内CZ当選", k: cz100Summary.winCount, n: cz100Summary.totalCount, rates: CZ_WITHIN_100_RATE });
  if (pullbackSummary.totalCount > 0) samples.push({ key: "pullback", label: "AT引き戻し", k: pullbackSummary.winCount, n: pullbackSummary.totalCount, rates: PULLBACK_RATE });

  const hintSummary = summarizeHints(Array.isArray(obs.hint_flags) ? obs.hint_flags : []);
  const hintMinSetting = Math.max(0, ...hintSummary.minSettingSources.map((source) => source.minSetting)) || null;

  return {
    settingLabels: SETTING_LABELS,
    likelihoods: estimateSettingLikelihoods(samples),
    hintMinSetting,
    minSettingSources: hintSummary.minSettingSources,
    samples,
    totalGameCount,
    observedMetrics: [
      { label: "AT初当たり", value: atCount !== null && gameCount > 0 ? atCount / gameCount : null, format: "fraction" },
      { label: "CZ レミニセンス", value: remiCount !== null && gameCount > 0 ? remiCount / gameCount : null, format: "fraction" },
      { label: "上位CZ 大喰いの利世", value: rizeCount !== null && gameCount > 0 ? rizeCount / gameCount : null, format: "fraction" },
      { label: "エピソードボーナス", value: episodeCount !== null && gameCount > 0 ? episodeCount / gameCount : null, format: "fraction" },
      { label: "リプレイAT直撃", value: replayDirectCount !== null && gameCount > 0 ? replayDirectCount / gameCount : null, format: "fraction" },
      { label: "下段リプレイ", value: lowerReplayCount !== null && gameCount > 0 ? lowerReplayCount / gameCount : null, format: "fraction" },
      { label: "100G以内CZ", value: cz100Summary.winRate, format: "percent" },
      { label: "AT引き戻し", value: pullbackSummary.winRate, format: "percent" },
    ],
    cz100Summary,
    pullbackSummary,
    excludedSettings: hintSummary.excludedSettings,
    referenceHintSources: hintSummary.referenceNotes,
  };
}
