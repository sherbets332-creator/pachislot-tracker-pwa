/**
 * 貯玉換金のFIFOロット会計・実現差額調整（設計書 6.5・7.9）。
 * Flask版 app/services/saved_ball_realization.py の移植（純粋関数版）。
 *
 * - 'earn'（獲得）および 'adjust'（残高を増やす補正）の各行を「ロット」として扱う。
 * - 'use' / 'cashout' / 'adjust'（残高を減らす補正）は、ロットを獲得順（FIFO）に消費する。
 * - 'cashout'（実際に現金を受け取る換金）のときだけ、当初の計算価値と実受取額の差額を、
 *   消費した中で最も古いロットに全額割り当てる（ルール(b)。7.9参照）。
 * - 'use' や 'adjust' は消費順（どのロットが残るか）には影響するが、差額調整はトリガーしない。
 * - 獲得元の記録がないロット（'adjust'起源）が対象になった場合、差額はどの記録にも
 *   割り当てず、店舗別の「その他調整額」として集計する。
 *
 * Flask版は結果をDBテーブル（record_realization_adjustments）に保存していたが、
 * PWA版は「店舗の台帳が変わるたびに全部作り直す」という元々の設計方針をそのまま活かし、
 * 保存はせず、表示のたびにこの関数をその場で呼んで導出する（個人利用の件数であれば
 * 一瞬で終わる計算量のため、保存の仕組みを増やしてバグの温床を作らないようにする）。
 */
import { pyRound } from "./numberUtils.js";

/**
 * @param {Array} transactions 対象店舗の全取引（sync前提のソートは内部で行うので不要）
 * @returns {{
 *   adjustmentsByRecordId: Map<number, number>,  // records.realized_adjustment_total 相当
 *   otherAdjustmentTotal: number,                // 獲得元の記録がないロット分の差額合計
 *   entries: Array<object>,                      // record_realization_adjustments 相当（表示用）
 * }}
 */
export function recalculateShopLedger(transactions) {
  const sorted = [...transactions].sort((a, b) => {
    if (a.transaction_date !== b.transaction_date) {
      return a.transaction_date < b.transaction_date ? -1 : 1;
    }
    return a.id - b.id;
  });

  const lots = []; // 先頭(index 0)が最も古いロット。個人利用の件数ならshift()の速度は問題にならない
  const adjustmentsByRecordId = new Map();
  let otherAdjustmentTotal = 0;
  const entries = [];

  function consumeLots(qty) {
    const consumed = [];
    let remainingQty = qty;
    while (remainingQty > 0 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(lot.remaining, remainingQty);
      if (take <= 0) {
        lots.shift();
        continue;
      }
      lot.remaining -= take;
      remainingQty -= take;
      consumed.push({ lot, qty: take });
      if (lot.remaining <= 0) lots.shift();
    }
    return consumed;
  }

  function applyCashoutRealization(cashoutTx, consumed) {
    if (consumed.length === 0) return;

    const calculatedTotal = consumed.reduce((sum, c) => sum + pyRound(c.qty * c.lot.rate), 0);
    const diff = (cashoutTx.cash_amount || 0) - calculatedTotal;

    consumed.forEach((c, i) => {
      const calculatedValue = pyRound(c.qty * c.lot.rate);
      // ルール(b): 差額は最古のロット（先頭 = i === 0）にのみ全額割り当てる
      const adjustmentAmount = i === 0 ? diff : 0;

      entries.push({
        shop_id: cashoutTx.shop_id,
        record_id: c.lot.recordId,
        cashout_transaction_id: cashoutTx.id,
        consumed_ball_count: c.qty,
        calculated_value: calculatedValue,
        adjustment_amount: adjustmentAmount,
      });

      if (adjustmentAmount !== 0) {
        if (c.lot.recordId !== null) {
          adjustmentsByRecordId.set(
            c.lot.recordId,
            (adjustmentsByRecordId.get(c.lot.recordId) || 0) + adjustmentAmount
          );
        } else {
          otherAdjustmentTotal += adjustmentAmount;
        }
      }
    });
  }

  for (const tx of sorted) {
    if (tx.transaction_type === "earn") {
      lots.push({ recordId: tx.record_id, remaining: tx.ball_count, rate: tx.exchange_rate_used });
    } else if (tx.transaction_type === "adjust" && tx.ball_count > 0) {
      // 獲得元の記録がない新しいロット（初期残高登録など）
      lots.push({ recordId: null, remaining: tx.ball_count, rate: tx.exchange_rate_used });
    } else if (tx.transaction_type === "use" || (tx.transaction_type === "adjust" && tx.ball_count < 0)) {
      const qty = tx.transaction_type === "use" ? tx.ball_count : Math.abs(tx.ball_count);
      consumeLots(qty);
    } else if (tx.transaction_type === "cashout") {
      const consumed = consumeLots(tx.ball_count);
      applyCashoutRealization(tx, consumed);
    }
  }

  return { adjustmentsByRecordId, otherAdjustmentTotal, entries };
}
