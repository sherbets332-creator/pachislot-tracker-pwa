/**
 * 設定判別の簡易ベイズ推定（機種非依存の純粋関数）。
 *
 * 「556ゲームでAT2回」のような実測データと、機種ごとに公開されている設定1〜6の
 * 理論確率を突き合わせて、「観測データが出やすいのはどの設定か」を二項分布の
 * 尤度で相対比較する。事前分布は6設定とも均等（1/6）とする単純なモデル。
 *
 * 統計的に厳密な区間推定ではなく、あくまで「参考」の目安を出すためのもの。
 */

/**
 * 二項分布の対数尤度（組み合わせ項 log C(n,k) は設定間で共通なので省略している。
 * 複数サンプルの尤度を単純に足し合わせて比較する分には影響しない）。
 */
function binomialLogLikelihood(k, n, p) {
  if (n <= 0) return 0;
  const clampedP = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  return k * Math.log(clampedP) + (n - k) * Math.log(1 - clampedP);
}

/**
 * 複数の観測サンプルから、設定1〜6それぞれの相対尤度（合計1になる確率分布）を返す。
 *
 * @param {{k: number, n: number, rates: number[]}[]} samples
 *   k=成功回数, n=試行回数, rates=[設定1の確率, ..., 設定6の確率]。
 *   n が 0（まだデータが無い）のサンプルは自動的に無視される。
 * @returns {number[]} 長さ6の配列。各設定の相対尤度（合計1）。データが無ければ均等分布を返す。
 */
export function estimateSettingLikelihoods(samples) {
  const settingCount = 6;
  const logLikelihoods = new Array(settingCount).fill(0);

  for (const sample of samples) {
    if (!sample || sample.n <= 0) continue;
    for (let s = 0; s < settingCount; s += 1) {
      logLikelihoods[s] += binomialLogLikelihood(sample.k, sample.n, sample.rates[s]);
    }
  }

  const hasData = samples.some((s) => s && s.n > 0);
  if (!hasData) return new Array(settingCount).fill(1 / settingCount);

  // オーバーフロー防止のため最大値を引いてからexpする（softmaxと同じ考え方）。
  const maxLog = Math.max(...logLikelihoods);
  const weights = logLikelihoods.map((l) => Math.exp(l - maxLog));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}

/**
 * buildEstimate()の結果から、一覧画面や推定パネル上部に出す「一言サマリー」を作る。
 * 機種ごとのbuildEstimate実装が共通で持つ settingLabels／likelihoods／hintMinSetting／samples
 * （AGENTS.mdの契約）だけを見る機種非依存のロジックなので、新しい機種を追加してもそのまま使い回せる。
 *
 * @param {{settingLabels?: string[], likelihoods?: number[], hintMinSetting?: number|null,
 *           samples?: {n: number}[]}} estimate
 * @returns {string|null} 表示する一言。まだ判断材料が無ければnull。
 */
export function summarizeEstimateHeadline(estimate) {
  if (!estimate) return null;
  // 示唆から「設定◯以上濃厚」と言えるなら、それが一番はっきりした根拠なので優先する。
  if (estimate.hintMinSetting) {
    return `設定${estimate.hintMinSetting}以上濃厚`;
  }
  const hasData = Array.isArray(estimate.samples) && estimate.samples.some((s) => s && s.n > 0);
  if (!hasData) return null;

  const likelihoods = estimate.likelihoods || [];
  if (likelihoods.length === 0) return null;
  let maxIndex = 0;
  for (let i = 1; i < likelihoods.length; i += 1) {
    if (likelihoods[i] > likelihoods[maxIndex]) maxIndex = i;
  }
  const label = (estimate.settingLabels || [])[maxIndex];
  if (!label) return null;
  const pct = Math.round((likelihoods[maxIndex] || 0) * 100);
  return `${label}寄り（${pct}%）`;
}

/**
 * 「設定6濃厚」の示唆が出ているときだけ、推定の確率を設定6に固定する（機種非依存）。
 * 設定6は上限なので、「設定6以上」＝設定6確定として扱える。「設定4以上濃厚」などは、
 * 範囲が残るのでバーには反映しない（別表示のまま）。
 * 示唆を除いた、数値だけの推定は `rawLikelihoods` に残す（食い違いを見比べられるように）。
 */
export function applyConfirmedSetting(estimate) {
  if (!estimate || estimate.hintMinSetting !== 6) return estimate;
  const settingCount = (estimate.likelihoods || []).length || 6;
  const confirmed = new Array(settingCount).fill(0);
  confirmed[settingCount - 1] = 1;
  return { ...estimate, rawLikelihoods: estimate.likelihoods, likelihoods: confirmed, confirmedSetting: settingCount };
}

/**
 * 要素（サンプル）ごとに、その要素だけを見たときに「どの設定寄りか」と判別力の強さを返す。
 * 判別力 = 最も出やすい設定と最も出にくい設定の尤度の比（ratio）。
 * 1.5倍未満＝弱（ほぼ平ら。まだ何も言えない）、4倍未満＝中、4倍以上＝強。
 *
 * @param {{key?:string,label:string,k:number,n:number,rates:number[]}[]} samples
 */
export function summarizeSampleContributions(samples = []) {
  return samples
    .filter((sample) => sample && sample.n > 0 && Array.isArray(sample.rates))
    .map((sample) => {
      const likelihoods = estimateSettingLikelihoods([sample]);
      let bestIndex = 0;
      let worstIndex = 0;
      for (let i = 1; i < likelihoods.length; i += 1) {
        if (likelihoods[i] > likelihoods[bestIndex]) bestIndex = i;
        if (likelihoods[i] < likelihoods[worstIndex]) worstIndex = i;
      }
      const ratio = likelihoods[worstIndex] > 0 ? likelihoods[bestIndex] / likelihoods[worstIndex] : Infinity;
      const strength = ratio < 1.5 ? "weak" : ratio < 4 ? "medium" : "strong";
      return {
        key: sample.key ?? null,
        label: sample.label,
        k: sample.k,
        n: sample.n,
        observedRate: sample.k / sample.n,
        likelihoods,
        bestIndex,
        ratio,
        strength,
      };
    });
}

/**
 * 機種モジュールの buildEstimate に、共通の後処理（設定6濃厚の反映・要素ごとの内訳）をつけた結果を返す。
 * 画面（フォーム・一覧）・匿名書き出しは、reference.buildEstimate を直接呼ばずこちらを使う。
 */
export function buildEstimateWithHints(reference, observation) {
  const estimate = reference.buildEstimate(observation);
  const withContributions = { ...estimate, contributions: summarizeSampleContributions(estimate.samples) };
  return applyConfirmedSetting(withContributions);
}
