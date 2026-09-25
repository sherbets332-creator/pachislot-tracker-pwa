/**
 * Python 3 の round()（偶数への丸め = 銀行丸め）と同じ結果を返す。
 *
 * JavaScript の Math.round() は「.5 は必ず正の方向に丸める」ため、
 * 例えば Math.round(2.5) === 3 だが Python の round(2.5) は 2 になる。
 * Flask版（Python）と金額計算を完全に一致させるため、ここで明示的に実装する。
 */
export function pyRound(value) {
  const floor = Math.floor(value);
  const diff = value - floor;
  const EPSILON = 1e-9; // 浮動小数点の誤差を吸収する
  if (diff < 0.5 - EPSILON) return floor;
  if (diff > 0.5 + EPSILON) return floor + 1;
  // ちょうど .5 の場合は偶数側に丸める
  return floor % 2 === 0 ? floor : floor + 1;
}
