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
