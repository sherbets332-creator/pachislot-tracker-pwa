#!/usr/bin/env node
/**
 * P-WORLD（https://www.p-world.co.jp/）から、店舗を検索してその店の設置機種一覧を
 * 取得するための開発者向けスクリプト。このPWA自体はサーバー不要・ブラウザ内完結の
 * 方針だが、P-WORLDはCORSを許可していないためブラウザから直接fetchできない。
 * そのため、Node（ブラウザのCORS制約を受けない）でこのスクリプトを手元で実行し、
 * 結果をターミナルに表示 → アプリの「機種情報」「店舗情報」の登録フォームに
 * 手作業でコピペする、という運用にしている（機種名は「機種情報」一覧の
 * 「まとめて登録」欄に貼り付ければ複数行を一括登録できる）。
 *
 * 使い方:
 *   node scripts/scrape_pworld.js <店舗名や住所の一部>
 *
 * 個人利用目的の低頻度なアクセスを想定（検索1回＋詳細ページ1回のみ取得する）。
 */
import readline from "node:readline/promises";

const USER_AGENT = "Mozilla/5.0 (compatible; pachislot-tracker-pwa personal-use script)";

function decodeBuffer(buffer, contentTypeHeader) {
  const headerCharsetMatch = /charset=([\w-]+)/i.exec(contentTypeHeader || "");
  let charset = headerCharsetMatch ? headerCharsetMatch[1].toLowerCase() : null;

  if (!charset) {
    // ヘッダーに無ければ、先頭だけlatin1で覗いて<meta charset>を探す（マルチバイト文字を
    // 誤って壊さないよう、metaタグは通常ASCII範囲に収まることを利用する）。
    const head = buffer.subarray(0, 2048).toString("latin1");
    const metaMatch = /charset=["']?([\w-]+)/i.exec(head);
    charset = metaMatch ? metaMatch[1].toLowerCase() : "utf-8";
  }
  if (charset === "x-euc-jp") charset = "euc-jp";
  return new TextDecoder(charset).decode(buffer);
}

async function fetchDecoded(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return decodeBuffer(buffer, res.headers.get("content-type"));
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** 検索結果ページから店舗の { name, url, address } 一覧を取り出す。 */
function parseHallSearchResults(html) {
  const results = [];
  const itemRe = /<div class="hallList-item js-hallList-item">([\s\S]*?)(?=<div class="hallList-item js-hallList-item">|<!-- \/hallList-body -->)/g;
  let itemMatch;
  while ((itemMatch = itemRe.exec(html))) {
    const block = itemMatch[1];
    const nameMatch = /<a class="hallList-item-name-link" href=["']?([^"'>\s]+)["']?>([^<]+)<\/a>/.exec(block);
    if (!nameMatch) continue;
    const addressMatch = /<p class="hallList-item-address[^"]*">\s*([^<]+)/.exec(block);
    results.push({
      url: nameMatch[1],
      name: normalizeText(nameMatch[2]),
      address: addressMatch ? normalizeText(addressMatch[1]) : "",
    });
  }
  return results;
}

/** 店舗詳細ページから設置機種一覧を { type: "P"|"S", name } の配列で取り出す（重複除去済み）。 */
function parseMachineList(html) {
  const re = /data-machine-type="(P|S)"[^>]*data-machine-id="(\d+)"[^>]*>\s*<p class="_pw-machine-item-machineName"><A HREF="[^"]+">\s*([\s\S]*?)\s*<\/A>/g;
  const seen = new Set();
  const results = [];
  let m;
  while ((m = re.exec(html))) {
    const type = m[1];
    const name = normalizeText(m[3]);
    const key = `${type}:${name}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    results.push({ type, name });
  }
  return results;
}

async function main() {
  const keyword = process.argv.slice(2).join(" ").trim();
  if (!keyword) {
    console.error("使い方: node scripts/scrape_pworld.js <店舗名や住所の一部>");
    process.exitCode = 1;
    return;
  }

  const searchUrl = `https://www.p-world.co.jp/halls?hall_name_address=${encodeURIComponent(keyword)}`;
  console.log(`検索中: ${searchUrl}`);
  const searchHtml = await fetchDecoded(searchUrl);
  const halls = parseHallSearchResults(searchHtml);

  if (halls.length === 0) {
    console.log("該当する店舗が見つかりませんでした。キーワードを変えて試してください。");
    return;
  }

  console.log(`\n${halls.length}件見つかりました${halls.length >= 20 ? "（サイト仕様により先頭ページ分のみ）" : ""}：\n`);
  halls.forEach((h, i) => {
    console.log(`  [${i + 1}] ${h.name}　${h.address}`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("\n機種一覧を見たい店舗の番号を入力してください（Enterで終了）: ");
  rl.close();

  const index = parseInt(answer.trim(), 10) - 1;
  if (Number.isNaN(index) || index < 0 || index >= halls.length) {
    console.log("終了します。");
    return;
  }

  const hall = halls[index];
  console.log(`\n取得中: ${hall.url}`);
  const hallHtml = await fetchDecoded(hall.url);
  const machines = parseMachineList(hallHtml);
  const pachinko = machines.filter((m) => m.type === "P");
  const slot = machines.filter((m) => m.type === "S");

  console.log("\n=== 店舗情報（「店舗情報」の新規登録フォームにコピペ用） ===");
  console.log(`店舗名: ${hall.name}`);
  console.log(`住所　: ${hall.address}`);

  console.log(`\n=== 設置機種一覧（「機種情報」の「まとめて登録」欄にコピペ用） ===`);
  console.log(`\n--- パチンコ（${pachinko.length}件） ---`);
  pachinko.forEach((m) => console.log(m.name));
  console.log(`\n--- スロット（${slot.length}件） ---`);
  slot.forEach((m) => console.log(m.name));

  if (machines.length === 0) {
    console.log("(機種情報が見つかりませんでした。ページ構成が変わった可能性があります)");
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exitCode = 1;
});
