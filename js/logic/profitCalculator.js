/**
 * 収支計算ロジック（設計書 6.3）。Flask版 app/services/profit_calculator.py の移植。
 *
 * profit_amount = payout_count * exchange_rate_used
 *               - (cash_investment + saved_ball_used * exchange_rate_used)
 *
 * 獲得・使用とも「換金レート」に統一する（7.7 参照）。
 * 端数は四捨五入（Pythonのround()と同じ銀行丸め）して整数円に丸める。
 */
import { pyRound } from "./numberUtils.js";

export function calculateProfit(cashInvestment, savedBallUsed, payoutCount, exchangeRateUsed) {
  const income = payoutCount * exchangeRateUsed;
  const cost = cashInvestment + savedBallUsed * exchangeRateUsed;
  return pyRound(income - cost);
}

/** 参考指標：貯玉使用分を現金換算した場合の投資額（6.6）。保存はしない、表示専用。 */
export function calculateLendingReference(savedBallUsed, lendingRateUsed) {
  return pyRound(savedBallUsed * lendingRateUsed);
}
