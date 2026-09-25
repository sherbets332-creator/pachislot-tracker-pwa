/**
 * 貯玉台帳（saved_ball_transactions）の残高計算（設計書 6.4）。
 * Flask版 app/services/saved_ball_ledger.py の移植（純粋関数版）。
 *
 * ここでの transactions は「対象店舗の全取引」を表す配列であることを前提とする
 * （呼び出し側で shop_id による絞り込み済みのものを渡す）。
 * 各要素の形:
 *   { id, shop_id, record_id, transaction_date, transaction_type, ball_count,
 *     cash_amount, exchange_rate_used, memo }
 * transaction_type: 'earn' | 'use' | 'cashout' | 'adjust'
 * ball_count: adjust のみ符号付き、それ以外（earn/use/cashout）は正の値。
 *
 * 記録保存時の 'use'/'earn' 行の作り直し（sync_record_transactions）と削除
 * （delete_record_transactions）は、DBへの書き込みを伴うため db.js（IndexedDB層）側に置く。
 */

function applyTransaction(balance, tx) {
  if (tx.transaction_type === "earn") return balance + tx.ball_count;
  if (tx.transaction_type === "use" || tx.transaction_type === "cashout") return balance - tx.ball_count;
  if (tx.transaction_type === "adjust") return balance + tx.ball_count; // 符号付きのためそのまま加算
  return balance;
}

/** 現在の貯玉残高 = SUM(earn) - SUM(use) - SUM(cashout) + SUM(adjust) */
export function getBalance(transactions) {
  return transactions.reduce((balance, tx) => applyTransaction(balance, tx), 0);
}

function sortByDateThenId(transactions) {
  return [...transactions].sort((a, b) => {
    if (a.transaction_date !== b.transaction_date) {
      return a.transaction_date < b.transaction_date ? -1 : 1;
    }
    return a.id - b.id;
  });
}

/**
 * 貯玉推移グラフ用：日付ごとの残高（その日の最後の取引が終わった時点の残高）を古い順に返す。
 * 同じ日に複数の取引があっても、その日1件（最終的な残高）にまとめる。
 * 戻り値: [[date, balance], ...] （Map ではなく配列にしているのは呼び出し側でのJSON化を楽にするため）
 */
export function getBalanceHistory(transactions) {
  const sorted = sortByDateThenId(transactions);
  let balance = 0;
  const balanceByDate = new Map();
  for (const tx of sorted) {
    balance = applyTransaction(balance, tx);
    balanceByDate.set(tx.transaction_date, balance);
  }
  return Array.from(balanceByDate.entries());
}

/** 店舗の貯玉増減履歴を時系列で返す（machine_name等の付加情報は呼び出し側でJOIN相当を行う）。 */
export function getLedger(transactions) {
  return sortByDateThenId(transactions);
}
