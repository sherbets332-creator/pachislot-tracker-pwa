/**
 * js/repository.js の統合テスト。
 * Flask版で実際にFlaskテストクライアントを使って検証した各シナリオ
 * （_manual_validation_check*.py, _manual_tx_check.py）を、
 * このリポジトリ層でも全く同じ結果になることを確認する。
 *
 * 実行: node js/logic/test/repository.test.js
 */
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDatabase, DB_NAME } from "../../db.js";
import {
  ValidationError,
  createShop,
  updateShop,
  archiveShop,
  unarchiveShop,
  deleteShop,
  listShops,
  createMachine,
  deleteMachine,
  listMachines,
  createRecord,
  updateRecord,
  deleteRecord,
  getRecord,
  computeDisplayProfits,
  createCashout,
  createAdjust,
  updateTransaction,
  deleteTransaction,
  getShopBalance,
  getShopSavedBallUsageGain,
  getShopRealization,
} from "../../repository.js";

let passCount = 0;
async function test(name, fn) {
  try {
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    const db = await openDatabase();
    await fn(db);
    db.close();
    passCount += 1;
    console.log(`OK   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function assertRejects(promise, message) {
  await assert.rejects(promise, ValidationError, message);
}

// ---------------------------------------------------------------------------
// 店舗・機種マスタ：登録・重複チェック
// ---------------------------------------------------------------------------
await test("店舗登録：重複名・レート未入力はエラー", async (db) => {
  await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "21.74" });
  await assertRejects(createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" }));
  await assertRejects(createShop(db, { name: "テスト店2", exchange_rate: "", lending_rate: "20" }));

  const shops = await listShops(db);
  assert.equal(shops.length, 1);
});

await test("機種登録：重複名はエラー", async (db) => {
  await createMachine(db, { name: "テスト機種" });
  await assertRejects(createMachine(db, { name: "テスト機種" }));
});

// ---------------------------------------------------------------------------
// 統合シナリオ: Flask版 _manual_validation_check.py と同じ流れ
// ---------------------------------------------------------------------------
await test("統合シナリオ: 残高不足チェック・FIFO実現差額・最終残高がFlask版と一致", async (db) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "21.74" });
  const machineId = await createMachine(db, { name: "テスト機種" });

  // 1. 貯玉0枚の状態で920枚使用 -> 残高不足エラー
  await assertRejects(
    createRecord(db, {
      play_date: "2026-01-01", shop_id: String(shopId), machine_id: String(machineId),
      cash_investment: "0", saved_ball_used: "920", payout_count: "0", saved_ball_earned: "0",
    })
  );

  // 2. 貯玉2000枚獲得（正常）
  const record1Id = await createRecord(db, {
    play_date: "2026-01-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "2000",
  });
  const record1 = await getRecord(db, record1Id);
  assert.equal(record1.profit_amount, 40000);

  // 3. 翌日920枚使用（正常）
  const record2Id = await createRecord(db, {
    play_date: "2026-01-02", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "920", payout_count: "0", saved_ball_earned: "0",
  });
  const record2 = await getRecord(db, record2Id);
  assert.equal(record2.profit_amount, -18400);
  assert.equal(await getShopBalance(db, shopId), 1080);
  assert.deepEqual(await getShopSavedBallUsageGain(db, shopId), { totalBalls: 920, totalGain: 1601 });

  // 4. さらに翌日1500枚使用 -> 残り1080枚しかないのでエラー
  await assertRejects(
    createRecord(db, {
      play_date: "2026-01-03", shop_id: String(shopId), machine_id: String(machineId),
      cash_investment: "0", saved_ball_used: "1500", payout_count: "0", saved_ball_earned: "0",
    })
  );

  // 5. 貯玉獲得数が回収枚数を超えるとエラー
  await assertRejects(
    createRecord(db, {
      play_date: "2026-01-04", shop_id: String(shopId), machine_id: String(machineId),
      cash_investment: "0", saved_ball_used: "0", payout_count: "100", saved_ball_earned: "200",
    })
  );

  // 6. 換金：残高1080のところ2000枚換金 -> エラー
  await assertRejects(createCashout(db, shopId, { transaction_date: "2026-01-05", ball_count: "2000", cash_amount: "40000" }));

  // 7. 換金：1080枚、実受取21000円 -> 正常
  await createCashout(db, shopId, { transaction_date: "2026-01-05", ball_count: "1080", cash_amount: "21000" });
  assert.equal(await getShopBalance(db, shopId), 0);

  // FIFO実現差額：1080枚換金、計算価値21600円、実受取21000円 -> 差額-600円が最初の記録(record1)に
  const realization = await getShopRealization(db, shopId);
  assert.equal(realization.adjustmentsByRecordId.get(record1Id), -600);

  // 表示用収支の確認
  const displayProfits = await computeDisplayProfits(db, [record1, record2]);
  assert.equal(displayProfits.get(record1Id), 40000 - 600);
  assert.equal(displayProfits.get(record2Id), -18400);

  // 8. 残高調整：現在0枚のところ-100枚 -> エラー
  await assertRejects(createAdjust(db, shopId, { transaction_date: "2026-01-06", ball_count: "-100" }));

  // 9. 残高調整：+500枚 -> 正常
  await createAdjust(db, shopId, { transaction_date: "2026-01-06", ball_count: "500" });

  // 10. 最終残高（Flask版と同じく500枚のはず）
  assert.equal(await getShopBalance(db, shopId), 500);
});

// ---------------------------------------------------------------------------
// エッジケース: 獲得数を減らす編集で、後続のuseが足りなくなる場合をブロックする
// ---------------------------------------------------------------------------
await test("記録編集：獲得数を減らして後続useが不足するならエラー", async (db) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "テスト機種" });

  const record1Id = await createRecord(db, {
    play_date: "2026-02-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "2000",
  });
  await createRecord(db, {
    play_date: "2026-02-02", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "920", payout_count: "0", saved_ball_earned: "0",
  });

  // record1の獲得を2000->500に減らす -> record2の使用920枚が足りなくなるのでエラー
  await assertRejects(
    updateRecord(db, record1Id, {
      play_date: "2026-02-01", shop_id: String(shopId), machine_id: String(machineId),
      cash_investment: "0", saved_ball_used: "0", payout_count: "500", saved_ball_earned: "500",
    })
  );

  // 950に減らすなら足りるのでOK
  await updateRecord(db, record1Id, {
    play_date: "2026-02-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "950", saved_ball_earned: "950",
  });
  assert.equal(await getShopBalance(db, shopId), 30);
});

// ---------------------------------------------------------------------------
// エッジケース: 既に消費済みの貯玉獲得記録の削除をブロックする
// ---------------------------------------------------------------------------
await test("記録削除：消費済みの獲得記録は削除ブロック、順序を守れば削除できる", async (db) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "テスト機種" });

  const record1Id = await createRecord(db, {
    play_date: "2026-03-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "2000",
  });
  const record2Id = await createRecord(db, {
    play_date: "2026-03-02", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "920", payout_count: "0", saved_ball_earned: "0",
  });

  // record1(獲得2000)を削除しようとする -> record2が使った920枚が足りなくなるので拒否
  await assertRejects(deleteRecord(db, record1Id));

  // record2(使用920)を先に削除 -> 正常
  await deleteRecord(db, record2Id);
  // 続けてrecord1を削除 -> 正常
  await deleteRecord(db, record1Id);

  assert.equal(await getShopBalance(db, shopId), 0);
});

// ---------------------------------------------------------------------------
// 換金・残高調整の編集・削除（Flask版 _manual_tx_check.py 相当）
// ---------------------------------------------------------------------------
await test("換金・残高調整の編集・削除", async (db) => {
  const shopId = await createShop(db, { name: "テスト店", exchange_rate: "20", lending_rate: "20" });
  const machineId = await createMachine(db, { name: "テスト機種" });

  await createRecord(db, {
    play_date: "2026-01-01", shop_id: String(shopId), machine_id: String(machineId),
    cash_investment: "0", saved_ball_used: "0", payout_count: "2000", saved_ball_earned: "2000",
  });

  const cashoutId = await createCashout(db, shopId, { transaction_date: "2026-01-02", ball_count: "1000", cash_amount: "20000" });
  assert.equal(await getShopBalance(db, shopId), 1000);

  // 2500枚に編集 -> 残高不足でエラー
  await assertRejects(updateTransaction(db, shopId, cashoutId, { transaction_date: "2026-01-02", ball_count: "2500", cash_amount: "50000" }));

  // 500枚に編集 -> 正常
  await updateTransaction(db, shopId, cashoutId, { transaction_date: "2026-01-02", ball_count: "500", cash_amount: "10000" });
  assert.equal(await getShopBalance(db, shopId), 1500);

  // 換金履歴（実現差額調整あり）を削除 -> 正常（PWA版は調整を保存しないのでFKの心配自体がない）
  await deleteTransaction(db, shopId, cashoutId);
  assert.equal(await getShopBalance(db, shopId), 2000);

  // 残高調整 -3000枚 -> エラー
  await assertRejects(createAdjust(db, shopId, { transaction_date: "2026-01-05", ball_count: "-3000" }));

  // 残高調整 +300枚 -> 正常
  const adjustId = await createAdjust(db, shopId, { transaction_date: "2026-01-05", ball_count: "300" });
  assert.equal(await getShopBalance(db, shopId), 2300);

  // +300を-500に編集 -> 他に2000枚あるので正常
  await updateTransaction(db, shopId, adjustId, { transaction_date: "2026-01-05", ball_count: "-500" });
  assert.equal(await getShopBalance(db, shopId), 1500);
});

// ---------------------------------------------------------------------------
// アーカイブ・削除（店舗・機種マスタ）
// ---------------------------------------------------------------------------
await test("店舗・機種のアーカイブ／削除", async (db) => {
  const usedShopId = await createShop(db, { name: "使用済み店", exchange_rate: "20", lending_rate: "20" });
  const unusedShopId = await createShop(db, { name: "未使用店", exchange_rate: "20", lending_rate: "20" });
  const usedMachineId = await createMachine(db, { name: "使用済み機種" });
  const unusedMachineId = await createMachine(db, { name: "未使用機種" });

  await createRecord(db, {
    play_date: "2026-01-01", shop_id: String(usedShopId), machine_id: String(usedMachineId),
    cash_investment: "1000", saved_ball_used: "0", payout_count: "0", saved_ball_earned: "0",
  });

  // 履歴がある店舗・機種は削除できない
  await assertRejects(deleteShop(db, usedShopId));
  await assertRejects(deleteMachine(db, usedMachineId));

  // 履歴が無ければ削除できる
  await deleteShop(db, unusedShopId);
  await deleteMachine(db, unusedMachineId);

  // アーカイブすると一覧から消え、show_archived相当では出る
  await archiveShop(db, usedShopId);
  let activeShops = await listShops(db);
  assert.equal(activeShops.some((s) => s.id === usedShopId), false);
  let archivedShops = await listShops(db, { includeArchived: true });
  assert.equal(archivedShops.some((s) => s.id === usedShopId), true);

  await unarchiveShop(db, usedShopId);
  activeShops = await listShops(db);
  assert.equal(activeShops.some((s) => s.id === usedShopId), true);
});

console.log(`\n${passCount} 件成功`);
