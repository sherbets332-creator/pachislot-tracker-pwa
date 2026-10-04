/**
 * 設定判別の観測記録を「匿名」で書き出すための純粋関数。
 *
 * 店舗名・店舗ID・台番号・メモ・正確な日付など、ホールや本人を特定できる情報は含めない
 * （日付は年月だけ）。判別の材料（ゲーム数・各種回数・メモのログ・示唆）と、その時点の推定結果だけを出す。
 * 「何が入るか」を利用者に見せるため、除外する項目と含める項目の説明も定数で持つ。
 */

/** 書き出しに含めないフィールド（観測記録の生データから取り除く）。 */
export const EXCLUDED_FIELDS = [
  "id",
  "shop_id",
  "machine_id",
  "machine_number",
  "memo",
  "play_date",
  "created_at",
  "updated_at",
];

/** 画面に出す「何が含まれ、何が含まれないか」の説明。 */
export const EXPORT_DESCRIPTION = {
  included: "ゲーム数・各種回数・周期やCZのメモ・示唆のチェック・その時点の推定結果・年月",
  excluded: "店舗名・台番号・メモ欄・日付（年月のみ残します）",
};

export const ANONYMOUS_EXPORT_FORMAT = "pachislot-observation-anonymous";

/** "2026-10-03" → "2026-10"。日付が不正なら null。 */
export function toYearMonth(playDate) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(playDate ?? ""));
  return match ? `${match[1]}-${match[2]}` : null;
}

/** 推定結果から、書き出し用の数値だけを取り出す（パーセントは小数1桁）。 */
function summarizeEstimateForExport(estimate) {
  if (!estimate) return null;
  const toPercents = (likelihoods = []) => likelihoods.map((value) => Math.round((value || 0) * 1000) / 10);
  return {
    setting_labels: estimate.settingLabels,
    likelihood_percent: toPercents(estimate.likelihoods),
    hint_min_setting: estimate.hintMinSetting ?? null,
    samples: (estimate.samples || []).map((sample) => ({ key: sample.key, label: sample.label, k: sample.k, n: sample.n })),
    alternative_estimates: (estimate.alternativeEstimates || []).map((alt) => ({
      label: alt.label,
      likelihood_percent: toPercents(alt.likelihoods),
    })),
  };
}

/**
 * @param {object} observation 観測記録（保存済み、または画面の入力値）
 * @param {{MACHINE_KEY:string, MACHINE_NAME:string}} reference 機種モジュール
 * @param {object|null} estimate `reference.buildEstimate(observation)` の結果
 */
export function buildAnonymousObservationExport(observation, reference, estimate) {
  const observationData = { ...observation };
  for (const field of EXCLUDED_FIELDS) delete observationData[field];
  return {
    format: ANONYMOUS_EXPORT_FORMAT,
    version: 1,
    machine_key: reference.MACHINE_KEY,
    machine_name: reference.MACHINE_NAME,
    play_year_month: toYearMonth(observation.play_date),
    observation: observationData,
    estimate: summarizeEstimateForExport(estimate),
  };
}

/** ファイル名。`pachislot-export-` で始めるので .gitignore の対象になり、うっかりcommitされない。 */
export function buildAnonymousExportFilename(exported) {
  const month = exported.play_year_month || "unknown";
  return `pachislot-export-observation-${exported.machine_key}-${month}.json`;
}
