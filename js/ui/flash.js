/**
 * Flask版の flash() 相当。ページ遷移をまたいで一度だけ表示するメッセージ。
 * SPAなのでフルページ遷移は起きないが、「保存しました」のようなメッセージを
 * 遷移直後の画面で表示したいので、sessionStorageに一時保存する方式にしている。
 */
import { escapeHtml } from "./format.js";

const KEY = "pachislot_flash";

export function setFlash(message) {
  sessionStorage.setItem(KEY, message);
}

function popFlash() {
  const msg = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return msg;
}

/** フラッシュメッセージがあればHTML片を返す（無ければ空文字列）。呼ぶたびに消費される。 */
export function renderFlash() {
  const msg = popFlash();
  if (!msg) return "";
  return `<div class="alert">${escapeHtml(msg)}</div>`;
}
