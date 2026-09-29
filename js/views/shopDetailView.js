/**
 * 店舗詳細画面。Flask版 templates/shops/detail.html 相当。
 */
import {
  getShop,
  getShopBalance,
  getShopSavedBallUsageGain,
  getShopBalanceHistory,
  getShopLedgerDetailed,
  getShopRealization,
} from "../repository.js";
import { renderFlash, setFlash } from "../ui/flash.js";
import { commas, profitClass, escapeHtml } from "../ui/format.js";
import { renderLineChart } from "../ui/simpleChart.js";
import { buildUrl, navigate } from "../router.js";

const TYPE_LABELS = { earn: "獲得", use: "使用", cashout: "換金", adjust: "調整" };

export async function renderShopDetail(container, db, shopId) {
  const shop = await getShop(db, shopId);
  if (!shop) {
    setFlash("店舗が見つかりませんでした（削除済みの可能性があります）。");
    navigate("/shops");
    return;
  }

  const balance = await getShopBalance(db, shopId);
  const usageGain = await getShopSavedBallUsageGain(db, shopId);
  const ledger = await getShopLedgerDetailed(db, shopId);
  const realization = await getShopRealization(db, shopId);
  const balanceHistory = await getShopBalanceHistory(db, shopId);

  const balanceChartHtml = balanceHistory.length
    ? `<div style="overflow-x:auto;"><div style="min-width:280px;">${renderLineChart({
        labels: balanceHistory.map(([date]) => date.slice(5)),
        values: balanceHistory.map(([, v]) => v),
        color: "#0d6efd",
        fill: true,
      })}</div></div>`
    : `<p class="muted small">まだ貯玉の増減履歴がありません。</p>`;

  const adjustmentRows = realization.entries.length
    ? `<table class="simple">
        <thead><tr><th>台の記録</th><th>消費枚数</th><th>計算価値</th><th>調整額</th></tr></thead>
        <tbody>
          ${realization.entries
            .map((entry) => {
              let recordLabel = "(その他調整)";
              if (entry.record_id !== null) {
                const relatedTx = ledger.find((t) => t.record_id === entry.record_id && t.transaction_type === "earn");
                recordLabel = relatedTx ? `${relatedTx.record_play_date} ${escapeHtml(relatedTx.machine_name ?? "")}` : `記録#${entry.record_id}`;
              }
              return `<tr>
                <td>${recordLabel}</td>
                <td>${commas(entry.consumed_ball_count)}枚</td>
                <td>${commas(entry.calculated_value)}円</td>
                <td class="${entry.adjustment_amount > 0 ? "plus" : entry.adjustment_amount < 0 ? "minus" : ""}">${commas(entry.adjustment_amount)}円</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`
    : `<p class="muted small">まだ実現差額調整はありません。</p>`;

  const ledgerRows = ledger.length
    ? `<table class="simple">
        <thead><tr><th>日付</th><th>種別</th><th>枚数</th><th>備考</th><th>操作</th></tr></thead>
        <tbody>
          ${ledger
            .map((t) => {
              let note = "";
              if (t.machine_name) note += escapeHtml(t.machine_name);
              if (t.cash_amount) note += `${note ? "／" : ""}受取${commas(t.cash_amount)}円`;
              if (t.memo) note += `${note ? "／" : ""}${escapeHtml(t.memo)}`;
              const action =
                t.transaction_type === "cashout" || t.transaction_type === "adjust"
                  ? `<a href="${buildUrl(`/shops/${shopId}/transactions/${t.id}/edit`)}">編集</a>`
                  : t.record_id
                    ? `<a href="${buildUrl(`/records/${t.record_id}/edit`)}">記録を編集</a>`
                    : "";
              return `<tr>
                <td>${t.transaction_date}</td>
                <td>${TYPE_LABELS[t.transaction_type]}</td>
                <td>${commas(t.ball_count)}</td>
                <td class="small muted">${note}</td>
                <td class="small">${action}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`
    : `<p class="muted">貯玉の増減履歴はまだありません。</p>`;

  container.innerHTML = `
    ${renderFlash()}
    <div class="calendar-header">
      <h1>${escapeHtml(shop.name)}</h1>
      <div style="display:flex;gap:6px;">
        <a class="btn btn-sm" href="${buildUrl(`/shops/${shopId}/machines`)}">設置機種</a>
        <a class="btn btn-sm" href="${buildUrl(`/shops/${shopId}/edit`)}">編集</a>
      </div>
    </div>
    <p class="muted">換金 ${shop.exchange_rate}円/枚 ／ 貸出（参考） ${shop.lending_rate}円/枚</p>

    <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div class="small muted">現在の貯玉残高</div>
        <div class="fw-bold" style="font-size:1.6rem;">${commas(balance)} 枚</div>
      </div>
      <div style="display:flex;gap:6px;">
        <a class="btn btn-sm" href="${buildUrl(`/shops/${shopId}/cashout`)}">貯玉換金</a>
        <a class="btn btn-sm" href="${buildUrl(`/shops/${shopId}/adjust`)}">残高調整</a>
      </div>
    </div>

    ${usageGain.totalGain > 0
      ? `<div class="card">
          貯玉 ${commas(usageGain.totalBalls)}枚 使って
          <span class="plus fw-bold">${commas(usageGain.totalGain)}円</span> 得しました
        </div>`
      : ""}

    <h2>貯玉残高の推移</h2>
    <div class="card">${balanceChartHtml}</div>

    <h2>換金差額調整履歴</h2>
    ${adjustmentRows}

    <h2>貯玉増減履歴</h2>
    ${ledgerRows}
  `;
}
