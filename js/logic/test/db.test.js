/**
 * js/db.js（IndexedDB層）の単体テスト。
 * fake-indexeddb（開発時のみのテスト用依存。本番のPWAには含まれない）で
 * Node上からIndexedDBの動作を検証する。
 *
 * 実行: node js/logic/test/db.test.js
 */
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDatabase, STORE_NAMES, getAll, getAllByIndex, getById, add, put, remove, nameExists, DB_NAME } from "../../db.js";

let passCount = 0;
async function test(name, fn) {
  try {
    // 各テストの前にDBを完全に削除してから開き直す（テスト間の状態漏れを防ぐ）。
    // 前のテストが失敗してdb.close()し損ねていると永遠にblockedのままになりうるので、
    // タイムアウトを設けて早めにエラーとして表面化させる（無言でハングするのを防ぐ）。
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      const timer = setTimeout(() => reject(new Error("deleteDatabaseがblockedのままタイムアウトしました（前のテストのdb.close()漏れの可能性）")), 3000);
      req.onsuccess = () => { clearTimeout(timer); resolve(); };
      req.onerror = () => { clearTimeout(timer); reject(req.error); };
      req.onblocked = () => { clearTimeout(timer); reject(new Error("deleteDatabaseがblockedになりました")); };
    });
    await fn();
    passCount += 1;
    console.log(`OK   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

await test("openDatabase: 5つのオブジェクトストアが作られる", async () => {
  const db = await openDatabase();
  const names = Array.from(db.objectStoreNames).sort();
  assert.deepEqual(names, ["machines", "records", "saved_ball_transactions", "shop_machines", "shops"].sort());
  db.close();
});

await test("add/getById: 追加したレコードをidで取得できる（自動採番）", async () => {
  const db = await openDatabase();
  const id = await add(db, STORE_NAMES.SHOPS, { name: "テスト店", exchange_rate: 20, lending_rate: 20, is_archived: 0 });
  assert.equal(typeof id, "number");
  const shop = await getById(db, STORE_NAMES.SHOPS, id);
  assert.equal(shop.name, "テスト店");
  assert.equal(shop.id, id);
  db.close();
});

await test("getAll: 追加した順にすべて取得できる", async () => {
  const db = await openDatabase();
  await add(db, STORE_NAMES.MACHINES, { name: "機種A", is_archived: 0 });
  await add(db, STORE_NAMES.MACHINES, { name: "機種B", is_archived: 0 });
  const all = await getAll(db, STORE_NAMES.MACHINES);
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((m) => m.name).sort(), ["機種A", "機種B"]);
  db.close();
});

await test("put: idを指定して更新できる", async () => {
  const db = await openDatabase();
  const id = await add(db, STORE_NAMES.SHOPS, { name: "旧名前", exchange_rate: 20, lending_rate: 20, is_archived: 0 });
  const shop = await getById(db, STORE_NAMES.SHOPS, id);
  shop.name = "新名前";
  await put(db, STORE_NAMES.SHOPS, shop);
  const updated = await getById(db, STORE_NAMES.SHOPS, id);
  assert.equal(updated.name, "新名前");
  assert.equal(updated.id, id); // idは変わらない
  db.close();
});

await test("remove: 削除するとgetByIdでundefinedになる", async () => {
  const db = await openDatabase();
  const id = await add(db, STORE_NAMES.MACHINES, { name: "消される機種", is_archived: 0 });
  await remove(db, STORE_NAMES.MACHINES, id);
  const after = await getById(db, STORE_NAMES.MACHINES, id);
  assert.equal(after, undefined);
  db.close();
});

await test("getAllByIndex: shop_idで絞り込める", async () => {
  const db = await openDatabase();
  const shopId1 = await add(db, STORE_NAMES.SHOPS, { name: "店1", exchange_rate: 20, lending_rate: 20, is_archived: 0 });
  const shopId2 = await add(db, STORE_NAMES.SHOPS, { name: "店2", exchange_rate: 20, lending_rate: 20, is_archived: 0 });
  await add(db, STORE_NAMES.SAVED_BALL_TRANSACTIONS, {
    shop_id: shopId1, record_id: null, transaction_date: "2026-01-01", transaction_type: "adjust", ball_count: 100,
  });
  await add(db, STORE_NAMES.SAVED_BALL_TRANSACTIONS, {
    shop_id: shopId2, record_id: null, transaction_date: "2026-01-01", transaction_type: "adjust", ball_count: 200,
  });
  const shop1Txs = await getAllByIndex(db, STORE_NAMES.SAVED_BALL_TRANSACTIONS, "shop_id", shopId1);
  assert.equal(shop1Txs.length, 1);
  assert.equal(shop1Txs[0].ball_count, 100);
  db.close();
});

await test("nameExists: 重複検出とexcludeIdでの自己除外", async () => {
  const db = await openDatabase();
  const id = await add(db, STORE_NAMES.SHOPS, { name: "重複チェック店", exchange_rate: 20, lending_rate: 20, is_archived: 0 });

  assert.equal(await nameExists(db, STORE_NAMES.SHOPS, "重複チェック店"), true);
  assert.equal(await nameExists(db, STORE_NAMES.SHOPS, "存在しない店"), false);
  // 自分自身のidを除外すれば「重複していない」扱いになる（編集で名前を変えない場合など）
  assert.equal(await nameExists(db, STORE_NAMES.SHOPS, "重複チェック店", id), false);
  db.close();
});

console.log(`\n${passCount} 件成功`);
