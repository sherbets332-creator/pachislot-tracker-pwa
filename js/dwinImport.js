/**
 * 「打-WIN LITE」（平和の実機データ確認サービス、dwlite.heiwa.jp）のページを取得・解析する。
 *
 * このファイルは特定機種に依存しない汎用パーサー。ページの構造（<table class="table2">の
 * ラベル/値の並び、スタンプ画像のファイル名）だけを見る。機種ごとの「どのスタンプ画像がどの
 * ENDING_STAMPS値に対応するか」は、各機種のsettingReferenceモジュール側
 * （ENDING_STAMPSの各要素が持つ任意の`dwinImageNames`配列）に持たせ、
 * matchEndingStampFromImages()で突き合わせる。
 *
 * 総ゲーム数・通常ゲーム数以外（戦国乙女ボーナス回数・乙女アタック回数など）は、名前が似ていても
 * 母数や定義が完全に一致するか未確認（例:「戦国乙女ボーナス回数」はページ上1/3,290と、公式の
 * ボーナス直撃確率1/21206〜1/5502とは明らかに違う頻度なので、恐らく別の統計）なため、
 * ここでは「参考データ」として生の値をそのまま返すだけで、判別ツールの計算用フィールドへの
 * 自動当てはめはしない（AGENTS.md参照）。
 */

/** <br>を区切りとして、セルのテキストを読みやすく1行にまとめる（"1 回<br>1/3,290.0" → "1 回 / 1/3,290.0"）。 */
function cellText(cell) {
  const html = cell.innerHTML.replace(/<br\s*\/?>/gi, " / ");
  const tmp = cell.ownerDocument.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent.replace(/\s+/g, " ").trim();
}

/** ページ中の「ラベル／値」の表（<table class="table2">）を全部、順序を保ったまま抜き出す。 */
export function extractTableRows(doc) {
  const rows = [];
  doc.querySelectorAll("table.table2 tr").forEach((tr) => {
    const cells = tr.querySelectorAll("td");
    if (cells.length >= 2) {
      rows.push({ label: cellText(cells[0]), value: cellText(cells[1]) });
    }
  });
  return rows;
}

function findRowValue(rows, label) {
  const row = rows.find((r) => r.label === label);
  return row ? row.value : null;
}

/** 「6,326 ゲーム」のような文字列から数値だけを取り出す。数値が無ければnull。 */
function parseGameCountText(text) {
  if (!text) return null;
  const digits = text.replace(/[,，]/g, "").match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

/**
 * 「N 回 / 1/X」の形式の行（例:「本能寺の変突入回数（確率）」=「11 回 / 1/138.5」）から、
 * 確率の分母になっているゲーム数を逆算する（N × X。11 × 138.5 ≒ 1,524G）。
 * 回数か確率が読めない行（「- / 0.0 %」など）はnull。
 */
export function deriveGameCountFromRateRow(rows, rowLabel) {
  const text = findRowValue(rows, rowLabel);
  if (!text) return null;
  const match = text.match(/(\d[\d,]*)\s*回.*?1\s*\/\s*(\d[\d,]*(?:\.\d+)?)/);
  if (!match) return null;
  const count = Number(match[1].replace(/,/g, ""));
  const denominator = Number(match[2].replace(/,/g, ""));
  if (!(count > 0) || !(denominator > 0)) return null;
  return { count, denominator, value: Math.round(count * denominator) };
}

/** スタンプ画像（stamp_wrapa_item_img／stamp_wrapb_item_img）のファイル名（拡張子抜き）一覧を返す。 */
export function extractStampImageNames(doc) {
  const names = [];
  doc.querySelectorAll(".stamp_wrapa_item_img, .stamp_wrapb_item_img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    const match = src.match(/([^/]+)\.[a-zA-Z0-9]+$/);
    if (match) names.push(match[1]);
  });
  return names;
}

/**
 * 検出したスタンプ画像ファイル名から、そのendingStampsの中で一番設定が高いもの
 * （dwinImageNamesに一致し、かつminSettingが一番大きいもの）を選ぶ。該当が無ければnull。
 */
export function matchEndingStampFromImages(endingStamps, imageNames) {
  let best = null;
  for (const stamp of endingStamps || []) {
    if (!stamp.dwinImageNames || !stamp.minSetting) continue;
    if (stamp.dwinImageNames.some((name) => imageNames.includes(name))) {
      if (!best || stamp.minSetting > best.minSetting) best = stamp;
    }
  }
  return best ? best.value : null;
}

/**
 * 打-WINのページ（Document）から、判別ツールに使う情報をまとめて取り出す。
 * @param {Document} doc
 * @param {{ENDING_STAMPS: object[]}} reference 対象機種のsettingReferenceモジュール
 * @returns {{totalGameCount: number|null, normalGameCount: number|null,
 *            maxEndingStamp: string|null, atGameCountDerived: {value:number, scopeLabel:string}|null,
 *            referenceRows: {label:string, value:string}[]}}
 */
export function parseDwinDocument(doc, reference) {
  const rows = extractTableRows(doc);
  const totalGameCount = parseGameCountText(findRowValue(rows, "総ゲーム数"));
  const normalGameCount = parseGameCountText(findRowValue(rows, "通常ゲーム数"));
  const stampImageNames = extractStampImageNames(doc);
  const maxEndingStamp = matchEndingStampFromImages(reference?.ENDING_STAMPS, stampImageNames);

  // 総ゲーム数・通常ゲーム数として自動反映に使った2行は、参考データの一覧からは除く（二重表示防止）。
  const referenceRows = rows.filter((r) => r.label !== "総ゲーム数" && r.label !== "通常ゲーム数");

  // AT中ゲーム数：機種モジュールが「どの行の分母がAT中ゲーム数に当たるか」を持っている場合だけ逆算する。
  const source = reference?.DWIN_AT_GAME_SOURCE;
  const derived = source ? deriveGameCountFromRateRow(rows, source.rowLabel) : null;
  const atGameCountDerived = derived ? { ...derived, scopeLabel: source.scopeLabel, rowLabel: source.rowLabel } : null;

  return { totalGameCount, normalGameCount, maxEndingStamp, atGameCountDerived, referenceRows };
}

/**
 * 打-WINのURLを取得してparseDwinDocumentする。CORSが許可されているページであることを
 * 2026-09時点でdwlite.heiwa.jpについて確認済み（Access-Control-Allow-Origin: *）。
 * fetchが失敗した場合（URL間違い・トークン切れ・別サイト等）はそのままエラーを投げるので、
 * 呼び出し側でcatchしてユーザーに分かるメッセージを出すこと。
 */
export async function fetchDwinData(url, reference) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ページの取得に失敗しました（status ${res.status}）。`);
  }
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return parseDwinDocument(doc, reference);
}
