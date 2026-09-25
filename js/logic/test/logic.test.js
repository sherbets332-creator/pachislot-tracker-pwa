/**
 * ロジック移植の単体テスト。
 *
 * Flask版で実際にFlaskテストクライアントを使って検証した各シナリオ
 * （記録・貯玉台帳・FIFO実現差額・残高不足バリデーション）を、
 * このJS版でも全く同じ結果になることを確認する。
 *
 * 実行: node js/logic/test/logic.test.js
 */
import assert from "node:assert/strict";
import { pyRound } from "../numberUtils.js";
import { calculateProfit, calculateLendingReference } from "../profitCalculator.js";
import { getBalance, getBalanceHistory } from "../savedBallLedger.js";
import { recalculateShopLedger } from "../savedBallRealization.js";
import {
  ValidationError,
  checkBalanceNeverNegative,
  checkEarnedNotExceedingPayout,
  parseIntField,
  requireDate,
  toHalfWidth,
} from "../validation.js";

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

// ---------------------------------------------------------------------------
// pyRound: Pythonのround()（銀行丸め）と一致するか
// ---------------------------------------------------------------------------
test("pyRound: Pythonのround()と同じ丸め方をする", () => {
  assert.equal(pyRound(2.5), 2); // Python: round(2.5) == 2 (JSのMath.roundは3になる)
  assert.equal(pyRound(1.5), 2); // Python: round(1.5) == 2
  assert.equal(pyRound(0.5), 0); // Python: round(0.5) == 0
  assert.equal(pyRound(-0.5), 0); // Python: round(-0.5) == 0
  assert.equal(pyRound(-1.5), -2); // Python: round(-1.5) == -2
  assert.equal(pyRound(2.4), 2);
  assert.equal(pyRound(2.6), 3);
  assert.equal(pyRound(-2.6), -3);
});

// ---------------------------------------------------------------------------
// calculateProfit / calculateLendingReference
// ---------------------------------------------------------------------------
test("calculateProfit: 現金投資のみ", () => {
  // 2000枚回収・換金レート20円、現金投資2000円 => 2000*20 - 2000 = 38000
  assert.equal(calculateProfit(2000, 0, 2000, 20), 38000);
});

test("calculateProfit: 貯玉使用あり（換金レート統一）", () => {
  // 貯玉920枚使用、回収0枚、換金レート20円 => 0 - 920*20 = -18400
  assert.equal(calculateProfit(0, 920, 0, 20), -18400);
});

test("calculateLendingReference: 貸出レート参考値", () => {
  // 920枚 * 貸出レート21.74円 = 20000.8 -> 銀行丸めで20001
  assert.equal(calculateLendingReference(920, 21.74), 20001);
});

// ---------------------------------------------------------------------------
// checkEarnedNotExceedingPayout
// ---------------------------------------------------------------------------
test("checkEarnedNotExceedingPayout: 超過していなければ何も起きない", () => {
  checkEarnedNotExceedingPayout(100, 200);
  checkEarnedNotExceedingPayout(200, 200);
});

test("checkEarnedNotExceedingPayout: 超過していればValidationError", () => {
  assert.throws(() => checkEarnedNotExceedingPayout(200, 100), ValidationError);
});

// ---------------------------------------------------------------------------
// 統合シナリオ: Flask版 _manual_validation_check.py と同じ流れを再現する
//   店舗レート20円。920枚使用 -> 残高不足エラー -> 2000枚獲得 -> 920枚使用(OK)
//   -> 1500枚使用(残高不足) -> 1080枚換金(実受取21000円、実現差額-600)
//   -> -100調整(残高不足) -> +500調整(OK) -> 最終残高500枚
// ---------------------------------------------------------------------------
test("統合シナリオ: Flaskテストと同じ結果になる", () => {
  const SHOP_ID = 1;
  const RATE = 20;
  let nextTxId = 1;
  let nextRecordId = 1;
  const transactions = []; // このテストでは shop_id=1 の取引だけを扱う

  function addTx(partial) {
    const tx = { id: nextTxId, shop_id: SHOP_ID, record_id: null, cash_amount: null, exchange_rate_used: null, memo: null, ...partial };
    nextTxId += 1;
    transactions.push(tx);
    return tx;
  }

  // 1. 貯玉0枚の状態で920枚使用 -> 残高不足エラーになるはず
  assert.throws(() => {
    checkBalanceNeverNegative(transactions, [{ transaction_date: "2026-01-01", transaction_type: "use", ball_count: 920 }]);
  }, ValidationError);

  // 2. 記録：貯玉2000枚獲得（正常）
  {
    const recordId = nextRecordId; nextRecordId += 1;
    checkBalanceNeverNegative(transactions, [{ transaction_date: "2026-01-01", transaction_type: "earn", ball_count: 2000 }]);
    addTx({ record_id: recordId, transaction_date: "2026-01-01", transaction_type: "earn", ball_count: 2000, exchange_rate_used: RATE });
  }
  assert.equal(getBalance(transactions), 2000);

  // 3. 記録：翌日920枚使用（正常）
  const recordBId = nextRecordId; nextRecordId += 1;
  checkBalanceNeverNegative(transactions, [{ transaction_date: "2026-01-02", transaction_type: "use", ball_count: 920 }]);
  addTx({ record_id: recordBId, transaction_date: "2026-01-02", transaction_type: "use", ball_count: 920 });
  assert.equal(getBalance(transactions), 1080);

  // 4. さらに翌日1500枚使用 -> 残り1080枚しかないのでエラーのはず
  assert.throws(() => {
    checkBalanceNeverNegative(transactions, [{ transaction_date: "2026-01-03", transaction_type: "use", ball_count: 1500 }]);
  }, ValidationError);

  // 5. 換金：残高1080枚のところ、2000枚換金しようとする -> エラーのはず
  assert.throws(() => {
    checkBalanceNeverNegative(transactions, [{ transaction_date: "2026-01-05", transaction_type: "cashout", ball_count: 2000 }]);
  }, ValidationError);

  // 6. 換金：1080枚、実受取21000円 -> 正常のはず
  let cashoutTxId;
  {
    checkBalanceNeverNegative(transactions, [{ transaction_date: "2026-01-05", transaction_type: "cashout", ball_count: 1080 }]);
    const tx = addTx({ transaction_date: "2026-01-05", transaction_type: "cashout", ball_count: 1080, cash_amount: 21000 });
    cashoutTxId = tx.id;
  }
  assert.equal(getBalance(transactions), 0);

  // FIFO実現差額: 1080枚換金、計算価値1080*20=21600円、実受取21000円 -> 差額-600円が最初の記録(earn)に
  const realization = recalculateShopLedger(transactions);
  const firstRecordId = 1; // 手順1で作った記録のID
  assert.equal(realization.adjustmentsByRecordId.get(firstRecordId), -600);
  assert.equal(realization.entries.length, 1);
  assert.equal(realization.entries[0].cashout_transaction_id, cashoutTxId);
  assert.equal(realization.entries[0].consumed_ball_count, 1080);
  assert.equal(realization.entries[0].calculated_value, 21600);
  assert.equal(realization.entries[0].adjustment_amount, -600);

  // 7. 残高調整：現在0枚のところ-100枚 -> エラーのはず
  assert.throws(() => {
    checkBalanceNeverNegative(transactions, [{ transaction_date: "2026-01-06", transaction_type: "adjust", ball_count: -100 }]);
  }, ValidationError);

  // 8. 残高調整：+500枚 -> 正常のはず
  checkBalanceNeverNegative(transactions, [{ transaction_date: "2026-01-06", transaction_type: "adjust", ball_count: 500 }]);
  addTx({ transaction_date: "2026-01-06", transaction_type: "adjust", ball_count: 500, exchange_rate_used: RATE });

  // 9. 最終残高確認（Flask版の実行結果と同じく500枚のはず）
  assert.equal(getBalance(transactions), 500);
});

// ---------------------------------------------------------------------------
// エッジケース: 貯玉獲得数を減らす編集で、後続の使用が足りなくなる場合をブロックする
//   （Flask版 _manual_validation_check2.py で見つけた重要なケース）
// ---------------------------------------------------------------------------
test("編集で獲得数を減らすと、後続のuseが足りなくなるならエラー", () => {
  const transactions = [
    { id: 1, shop_id: 1, record_id: 100, transaction_date: "2026-02-01", transaction_type: "earn", ball_count: 2000, ball_count_signed: null, exchange_rate_used: 20, cash_amount: null },
    { id: 2, shop_id: 1, record_id: 200, transaction_date: "2026-02-02", transaction_type: "use", ball_count: 920, exchange_rate_used: null, cash_amount: null },
  ];

  // 記録100の獲得を2000->500に減らす場合、record_id=100のuse/earn行を除外して新しい値を提案する
  assert.throws(() => {
    checkBalanceNeverNegative(
      transactions,
      [{ transaction_date: "2026-02-01", transaction_type: "earn", ball_count: 500 }],
      { excludeRecordId: 100 }
    );
  }, ValidationError);

  // 500 -> 920以上に戻せば正常
  checkBalanceNeverNegative(
    transactions,
    [{ transaction_date: "2026-02-01", transaction_type: "earn", ball_count: 920 }],
    { excludeRecordId: 100 }
  );
});

// ---------------------------------------------------------------------------
// エッジケース: 換金履歴の編集・削除（exclude_transaction_id）
//   Flask版 _manual_tx_check.py と同じ結果になるか
// ---------------------------------------------------------------------------
test("換金履歴の編集: 残高不足はブロック、範囲内はOK", () => {
  const transactions = [
    { id: 1, shop_id: 1, record_id: 10, transaction_date: "2026-01-01", transaction_type: "earn", ball_count: 2000, exchange_rate_used: 20, cash_amount: null },
    { id: 2, shop_id: 1, record_id: null, transaction_date: "2026-01-02", transaction_type: "cashout", ball_count: 1000, exchange_rate_used: null, cash_amount: 20000 },
  ];

  // cashout(id=2)を2500枚に編集しようとする -> 残高2000しかないのでエラー
  assert.throws(() => {
    checkBalanceNeverNegative(
      transactions,
      [{ transaction_date: "2026-01-02", transaction_type: "cashout", ball_count: 2500 }],
      { excludeTransactionId: 2 }
    );
  }, ValidationError);

  // 500枚に編集 -> 正常
  checkBalanceNeverNegative(
    transactions,
    [{ transaction_date: "2026-01-02", transaction_type: "cashout", ball_count: 500 }],
    { excludeTransactionId: 2 }
  );
});

test("残高調整の削除: プラス調整の削除で既存使用分が不足するならエラー", () => {
  const transactions = [
    { id: 1, shop_id: 1, record_id: null, transaction_date: "2026-01-01", transaction_type: "adjust", ball_count: 300, exchange_rate_used: 20, cash_amount: null },
    { id: 2, shop_id: 1, record_id: 20, transaction_date: "2026-01-02", transaction_type: "use", ball_count: 300, exchange_rate_used: null, cash_amount: null },
  ];
  // id=1の+300調整を削除しようとする（proposed空、その行だけ除外） -> 残高が-300になるのでエラー
  assert.throws(() => {
    checkBalanceNeverNegative(transactions, [], { excludeTransactionId: 1 });
  }, ValidationError);
});

// ---------------------------------------------------------------------------
// getBalanceHistory / toHalfWidth / requireDate / parseIntField の基本動作
// ---------------------------------------------------------------------------
test("getBalanceHistory: 同日の複数取引は最終残高にまとめる", () => {
  const transactions = [
    { id: 1, transaction_date: "2026-01-01", transaction_type: "earn", ball_count: 1000 },
    { id: 2, transaction_date: "2026-01-01", transaction_type: "use", ball_count: 200 },
    { id: 3, transaction_date: "2026-01-03", transaction_type: "adjust", ball_count: -50 },
  ];
  const history = getBalanceHistory(transactions);
  assert.deepEqual(history, [
    ["2026-01-01", 800],
    ["2026-01-03", 750],
  ]);
});

test("toHalfWidth: 全角数字・全角ハイフンを半角に変換する", () => {
  assert.equal(toHalfWidth("４６"), "46");
  assert.equal(toHalfWidth("－１２３"), "-123");
});

test("parseIntField: 全角数字も整数として読める", () => {
  assert.equal(parseIntField("４６", "枚数"), 46);
});

test("parseIntField: 空文字はrequired=falseなら0", () => {
  assert.equal(parseIntField("", "枚数", { required: false }), 0);
});

test("parseIntField: 空文字はrequired既定でエラー", () => {
  assert.throws(() => parseIntField("", "枚数"), ValidationError);
});

test("requireDate: 不正な形式はエラー", () => {
  assert.throws(() => requireDate("2026/01/01", "日付"), ValidationError);
  assert.equal(requireDate("2026-01-01", "日付"), "2026-01-01");
});

console.log(`\n${passCount} 件成功`);
