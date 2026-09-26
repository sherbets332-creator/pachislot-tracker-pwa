/** 金額・枚数を3桁区切りで表示する（Flask版の commas Jinjaフィルタ相当）。 */
export function commas(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Math.round(Number(value));
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("en-US");
}

/** ユーザー入力をinnerHTMLに埋め込む前にエスケープする。 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** profit（円）に応じて plus/minus クラスを返す。 */
export function profitClass(value) {
  return value >= 0 ? "plus" : "minus";
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

export function todayDateString() {
  const now = new Date();
  return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
