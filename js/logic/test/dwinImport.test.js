/**
 * 打-WIN LITE（dwlite.heiwa.jp）のページ解析（js/dwinImport.js）のテスト。
 * 実際に取得したページ（2026-09時点）を元にした簡略版HTMLで検証する。DB非依存。
 *
 * 実行: node js/logic/test/dwinImport.test.js
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { extractTableRows, extractStampImageNames, matchEndingStampFromImages, parseDwinDocument, deriveGameCountFromRateRow } from "../../dwinImport.js";
import * as sengokuOtome5 from "../settingReference/sengokuOtome5.js";
import { ENDING_STAMPS } from "../settingReference/sengokuOtome5.js";

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`OK   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// 実際に取得したページ（2026-09時点）を元にした簡略版。
const SAMPLE_HTML = `
<!doctype html><html><body>
  <h2>基本情報</h2>
  <div class="box1">
    <table class="table2"><tbody>
      <tr><td>総ゲーム数</td><td>6,326 ゲーム</td></tr>
      <tr><td>通常ゲーム数</td><td>3,290 ゲーム</td></tr>
    </tbody></table>
  </div>
  <h2>通常時詳細情報</h2>
  <div class="box1">
    <table class="table2"><tbody>
      <tr><td>戦国乙女ボーナス回数（確率）</td><td>1 回<br>1/3,290.0</td></tr>
      <tr><td>（プレミアム）乙女アタック回数（確率）</td><td>5 回<br>1/658.0</td></tr>
    </tbody></table>
  </div>
  <h2>スタンプ</h2>
  <div class="box4">
    <div class="stamp_container">
      <div class="stamp_wrapa"><div class="stamp_wrapa_item"><img class="stamp_wrapa_item_img" src="https://dwlite.heiwa.jp/img/ka.png" /></div></div>
      <div class="stamp_wrapa"><div class="stamp_wrapa_item"><img class="stamp_wrapa_item_img" src="https://dwlite.heiwa.jp/img/kiti.png" /></div></div>
      <div class="stamp_wrapa"><div class="stamp_wrapa_item"></div></div>
      <div class="stamp_wrapb"><div class="stamp_wrapb_item"><img class="stamp_wrapb_item_img" src="https://dwlite.heiwa.jp/img/yu.png" /></div></div>
      <div class="stamp_wrapb"><div class="stamp_wrapb_item"></div></div>
    </div>
  </div>
</body></html>
`;

function buildDoc(html) {
  return new JSDOM(html).window.document;
}

// ---------------------------------------------------------------------------
test("extractTableRows: <table class=table2>の行をラベル・値の組で抜き出す（<br>は区切りにする）", () => {
  const rows = extractTableRows(buildDoc(SAMPLE_HTML));
  assert.deepEqual(rows, [
    { label: "総ゲーム数", value: "6,326 ゲーム" },
    { label: "通常ゲーム数", value: "3,290 ゲーム" },
    { label: "戦国乙女ボーナス回数（確率）", value: "1 回 / 1/3,290.0" },
    { label: "（プレミアム）乙女アタック回数（確率）", value: "5 回 / 1/658.0" },
  ]);
});

test("extractStampImageNames: スタンプ画像のファイル名（拡張子抜き）一覧を返す。未達成の空欄は無視する", () => {
  const names = extractStampImageNames(buildDoc(SAMPLE_HTML));
  assert.deepEqual(names, ["ka", "kiti", "yu"]);
});

test("matchEndingStampFromImages: 検出した画像から一番設定が高いスタンプを選ぶ", () => {
  const value = matchEndingStampFromImages(ENDING_STAMPS, ["ka", "kiti", "yu"]);
  assert.equal(value, "yu"); // 可・吉・優のうち、優（設定5以上）が一番高い
});

test("matchEndingStampFromImages: 該当する画像が無ければnull", () => {
  assert.equal(matchEndingStampFromImages(ENDING_STAMPS, ["something_else"]), null);
  assert.equal(matchEndingStampFromImages(ENDING_STAMPS, []), null);
});

test("parseDwinDocument: 総ゲーム数・通常ゲーム数・最高スタンプを取り出し、残りは参考データとして返す", () => {
  const reference = { ENDING_STAMPS };
  const result = parseDwinDocument(buildDoc(SAMPLE_HTML), reference);
  assert.equal(result.totalGameCount, 6326);
  assert.equal(result.normalGameCount, 3290);
  assert.equal(result.maxEndingStamp, "yu");
  // 総ゲーム数・通常ゲーム数の2行は参考データからは除かれ、残り2行だけが入っている。
  assert.equal(result.referenceRows.length, 2);
  assert.equal(result.referenceRows[0].label, "戦国乙女ボーナス回数（確率）");
});

test("parseDwinDocument: 何も一致しなければnull／空配列を返す（例外にはならない）", () => {
  const result = parseDwinDocument(buildDoc("<html><body></body></html>"), { ENDING_STAMPS });
  assert.equal(result.totalGameCount, null);
  assert.equal(result.normalGameCount, null);
  assert.equal(result.maxEndingStamp, null);
  assert.deepEqual(result.referenceRows, []);
});


// 実際のページ（2026-10）の項目名・値の書式に合わせたサンプル
const RATE_ROWS_HTML = `<!doctype html><html><body><table class="table2"><tbody>
  <tr><td>総ゲーム数</td><td>7,048 ゲーム</td></tr>
  <tr><td>通常ゲーム数</td><td>4,365 ゲーム</td></tr>
  <tr><td>強カワRUSH突入回数（確率）</td><td>17 回<br>1/256.8</td></tr>
  <tr><td>本能寺の変突入回数（確率）</td><td>11 回<br>1/138.5</td></tr>
  <tr><td>本能寺の変　連戦突入回数（確率）</td><td>1 回<br>9.1 %</td></tr>
  <tr><td>カシンバトル　連戦突入回数（確率）</td><td>-<br>0.0 %</td></tr>
</tbody></table></body></html>`;

test("deriveGameCountFromRateRow: 回数×確率の分母でゲーム数を逆算する（11回・1/138.5 → 約1,524G）", () => {
  const rows = extractTableRows(new JSDOM(RATE_ROWS_HTML).window.document);
  const derived = deriveGameCountFromRateRow(rows, "本能寺の変突入回数（確率）");
  assert.equal(derived.count, 11);
  assert.equal(derived.denominator, 138.5);
  assert.equal(derived.value, 1524);
});

test("deriveGameCountFromRateRow: 確率が1/Xの形でない行（%表記・回数なし）や無い行はnull", () => {
  const rows = extractTableRows(new JSDOM(RATE_ROWS_HTML).window.document);
  assert.equal(deriveGameCountFromRateRow(rows, "本能寺の変　連戦突入回数（確率）"), null);
  assert.equal(deriveGameCountFromRateRow(rows, "カシンバトル　連戦突入回数（確率）"), null);
  assert.equal(deriveGameCountFromRateRow(rows, "存在しない行"), null);
});

test("parseDwinDocument: 機種がDWIN_AT_GAME_SOURCEを持てば、AT中ゲーム数を逆算して返す（持たない機種はnull）", () => {
  const doc = new JSDOM(RATE_ROWS_HTML).window.document;
  const withSource = parseDwinDocument(doc, sengokuOtome5);
  assert.equal(withSource.atGameCountDerived.value, 1524);
  assert.equal(withSource.atGameCountDerived.scopeLabel, "強カワRUSH中");
  const withoutSource = parseDwinDocument(doc, { ENDING_STAMPS: [] });
  assert.equal(withoutSource.atGameCountDerived, null);
});

console.log(`\n${passCount} 件成功`);
