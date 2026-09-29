/**
 * IndexedDBのスキーマ定義と低レベルの汎用CRUD。
 *
 * このファイルはブラウザのグローバル indexedDB / IDBKeyRange をそのまま使う
 * （importはしない）。Node.jsでテストするときは、テストファイル側で
 * fake-indexeddb をグローバルに設定してからこのモジュールをimportすること。
 *
 * テーブル構成（5ストア。設計はFlask版schema.sqlを踏襲しつつ、
 * record_realization_adjustments は保存せず savedBallRealization.js で
 * その場で導出する方針にしたため、5テーブル→4ストアに簡略化している。
 * shop_machines（店舗ごとの設置機種）はFlask版には無い、PWA版独自の追加ストア）。
 */

export const DB_NAME = "pachislot-tracker";
export const DB_VERSION = 2;

export const STORE_NAMES = Object.freeze({
  SHOPS: "shops",
  MACHINES: "machines",
  RECORDS: "records",
  SAVED_BALL_TRANSACTIONS: "saved_ball_transactions",
  SHOP_MACHINES: "shop_machines",
});

/** DBを開く（初回はオブジェクトストア・インデックスを作成する）。 */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAMES.SHOPS)) {
        const shops = db.createObjectStore(STORE_NAMES.SHOPS, { keyPath: "id", autoIncrement: true });
        shops.createIndex("name", "name", { unique: true });
        shops.createIndex("is_archived", "is_archived");
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.MACHINES)) {
        const machines = db.createObjectStore(STORE_NAMES.MACHINES, { keyPath: "id", autoIncrement: true });
        machines.createIndex("name", "name", { unique: true });
        machines.createIndex("is_archived", "is_archived");
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.RECORDS)) {
        const records = db.createObjectStore(STORE_NAMES.RECORDS, { keyPath: "id", autoIncrement: true });
        records.createIndex("play_date", "play_date");
        records.createIndex("shop_id", "shop_id");
        records.createIndex("machine_id", "machine_id");
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.SAVED_BALL_TRANSACTIONS)) {
        const sbt = db.createObjectStore(STORE_NAMES.SAVED_BALL_TRANSACTIONS, {
          keyPath: "id",
          autoIncrement: true,
        });
        sbt.createIndex("shop_id", "shop_id");
        sbt.createIndex("record_id", "record_id");
      }

      // v2: 店舗ごとの設置機種（「この店舗に今ある機種だけ」に記録入力の選択肢を絞るため）。
      if (!db.objectStoreNames.contains(STORE_NAMES.SHOP_MACHINES)) {
        const shopMachines = db.createObjectStore(STORE_NAMES.SHOP_MACHINES, { keyPath: "id", autoIncrement: true });
        shopMachines.createIndex("shop_id", "shop_id");
        shopMachines.createIndex("machine_id", "machine_id");
        shopMachines.createIndex("shop_machine", ["shop_id", "machine_id"], { unique: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** ストア内の全レコードを返す。 */
export async function getAll(db, storeName) {
  const tx = db.transaction(storeName, "readonly");
  const result = await promisifyRequest(tx.objectStore(storeName).getAll());
  return result;
}

/** インデックスの値で絞り込んで全件返す。 */
export async function getAllByIndex(db, storeName, indexName, value) {
  const tx = db.transaction(storeName, "readonly");
  const result = await promisifyRequest(tx.objectStore(storeName).index(indexName).getAll(value));
  return result;
}

/** idで1件取得する（無ければ undefined）。 */
export async function getById(db, storeName, id) {
  const tx = db.transaction(storeName, "readonly");
  return promisifyRequest(tx.objectStore(storeName).get(id));
}

/** 新規追加。自動採番されたidを返す。 */
export async function add(db, storeName, obj) {
  const tx = db.transaction(storeName, "readwrite");
  const id = await promisifyRequest(tx.objectStore(storeName).add(obj));
  await promisifyTransaction(tx);
  return id;
}

/** idを指定して丸ごと上書き保存する（idが無ければ新規作成）。 */
export async function put(db, storeName, obj) {
  const tx = db.transaction(storeName, "readwrite");
  const id = await promisifyRequest(tx.objectStore(storeName).put(obj));
  await promisifyTransaction(tx);
  return id;
}

/** idで1件削除する。 */
export async function remove(db, storeName, id) {
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(id);
  await promisifyTransaction(tx);
}

/** ストアの中身を全部消す（インポート時、既存データを丸ごと置き換えるために使う）。 */
export async function clear(db, storeName) {
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).clear();
  await promisifyTransaction(tx);
}

/** 複数件を1つのトランザクションでまとめて書き込む（インポート用。id付きで渡せばそのidのまま入る）。 */
export async function bulkPut(db, storeName, items) {
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const item of items) store.put(item);
  await promisifyTransaction(tx);
}

/**
 * 名前の重複チェック（shops/machinesのUNIQUE制約の代わり）。
 * excludeId を指定すると、そのidのレコード自身は重複判定から除外する（編集時用）。
 */
export async function nameExists(db, storeName, name, excludeId = null) {
  const rows = await getAllByIndex(db, storeName, "name", name);
  return rows.some((row) => row.id !== excludeId);
}
