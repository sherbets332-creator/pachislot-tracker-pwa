/**
 * データのエクスポート／インポート（JSONファイル経由の手動バックアップ・移行）。
 *
 * 用途は2つ：
 * 1. Flask版（SQLite）からのデータ移行：Flask側の scripts/export_for_pwa.py が
 *    ここと同じ形のJSONを書き出すので、それをそのまま読み込める。
 * 2. PC↔スマホなど、複数端末間の手動同期：片方でエクスポートしたJSONを、
 *    もう片方でインポートする（リアルタイム同期ではなく、スナップショットの受け渡し）。
 *
 * インポートは「今の端末のデータを全部置き換える」destructiveな仕様にしている
 * （2つの端末のデータを賢くマージする、というのは競合解決が複雑になりすぎるため、
 *   あえてシンプルに倒している。呼び出し側で必ず確認を取ること）。
 */
import { getAll, clear, bulkPut, STORE_NAMES } from "./db.js";

const STORE_ORDER = [STORE_NAMES.SHOPS, STORE_NAMES.MACHINES, STORE_NAMES.RECORDS, STORE_NAMES.SAVED_BALL_TRANSACTIONS];
const EXPORT_VERSION = 1;

export async function exportAllData(db) {
  const data = { exported_at: new Date().toISOString(), version: EXPORT_VERSION };
  for (const store of STORE_ORDER) {
    data[store] = await getAll(db, store);
  }
  return data;
}

export class ImportError extends Error {}

function assertValidShape(data) {
  if (!data || typeof data !== "object") {
    throw new ImportError("ファイルの中身がJSONオブジェクトではありません。");
  }
  for (const store of STORE_ORDER) {
    if (data[store] !== undefined && !Array.isArray(data[store])) {
      throw new ImportError(`"${store}" が配列ではありません。エクスポートされたファイルではない可能性があります。`);
    }
  }
}

/** 今のデータを全部消してから、渡されたデータで置き換える。 */
export async function importAllData(db, data) {
  assertValidShape(data);
  for (const store of STORE_ORDER) {
    await clear(db, store);
  }
  for (const store of STORE_ORDER) {
    if (Array.isArray(data[store]) && data[store].length > 0) {
      await bulkPut(db, store, data[store]);
    }
  }
}

export function buildExportFilename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `pachislot-export-${y}-${m}-${d}.json`;
}
