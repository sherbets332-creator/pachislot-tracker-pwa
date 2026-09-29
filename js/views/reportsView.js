/**
 * 収支分析画面。Flask版 templates/reports/index.html + routes/reports.py 相当。
 * グラフはChart.jsの代わりに自前のSVGチャート（js/ui/simpleChart.js）を使う。
 */
import {
  getYearlyTotals,
  getMonthlyTotals,
  getMachineTotals,
  getShopTotals,
  getCashoutTotalsByShop,
  getOtherAdjustmentsByShop,
} from "../repository.js";
import { commas, profitClass, escapeHtml } from "../ui/format.js";
import { renderBarChart, renderLineChart } from "../ui/simpleChart.js";
import { renderFlash } from "../ui/flash.js";
import { buildUrl } from "../router.js";

function chartWrap(svg) {
  return `<div style="overflow-x:auto;"><div style="min-width:280px;">${svg}</div></div>`;
}

export async function renderReports(container, db) {
  const yearly = await getYearlyTotals(db);
  const monthlyAll = await getMonthlyTotals(db); // 昇順・全期間（グラフ用）
  const monthlyRecent = [...monthlyAll].reverse().slice(0, 12); // 降順・直近12件（表用）
  const byMachine = await getMachineTotals(db);
  const byShop = await getShopTotals(db);
  const cashoutByShop = await getCashoutTotalsByShop(db);
  const otherAdjustments = await getOtherAdjustmentsByShop(db);

  const cashoutByShopName = new Map(cashoutByShop.map((c) => [c.shopName, c.totalCashout]));

  let chartHtml = `<p class="muted small mb-3">記録がありません。</p>`;
  if (monthlyAll.length > 0) {
    const labels = monthlyAll.map((m) => m.ym.slice(2)); // "26-09" のように短縮
    const monthlyValues = monthlyAll.map((m) => m.total);
    let cumulative = 0;
    const cumulativeValues = monthlyAll.map((m) => (cumulative += m.total));
    chartHtml = `
      <div class="card mb-3">
        <div class="small muted mb-1">月別収支</div>
        ${chartWrap(renderBarChart({ labels, values: monthlyValues }))}
        <div class="small muted mb-1 mt-2">累計収支</div>
        ${chartWrap(renderLineChart({ labels, values: cumulativeValues, fill: true }))}
      </div>
    `;
  }

  const yearlyRows = yearly.length
    ? yearly
        .map((y) => `<tr><td>${y.year}年</td><td>${y.playCount}</td><td class="fw-bold ${profitClass(y.total)}">${commas(y.total)}円</td></tr>`)
        .join("")
    : `<tr><td colspan="3" class="muted">記録がありません。</td></tr>`;

  const monthlyRows = monthlyRecent.length
    ? monthlyRecent
        .map((m) => `<tr><td>${m.ym}</td><td>${m.playCount}</td><td class="fw-bold ${profitClass(m.total)}">${commas(m.total)}円</td></tr>`)
        .join("")
    : `<tr><td colspan="3" class="muted">記録がありません。</td></tr>`;

  const machineRows = byMachine.length
    ? byMachine
        .map(
          (m) => `<tr><td><a href="${buildUrl("/records/list", { machine_id: m.machineId })}">${escapeHtml(m.machineName)}</a></td><td>${m.playCount}</td><td>${commas(m.avgProfit)}円</td><td class="fw-bold ${profitClass(m.total)}">${commas(m.total)}円</td></tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="muted">記録がありません。</td></tr>`;

  const shopRows = byShop.length
    ? byShop
        .map(
          (s) => `<tr>
            <td><a href="${buildUrl("/records/list", { shop_id: s.shopId })}">${escapeHtml(s.shopName)}</a></td>
            <td>${s.playCount}</td>
            <td class="fw-bold ${profitClass(s.total)}">${commas(s.total)}円</td>
            <td class="muted">${cashoutByShopName.has(s.shopName) ? `${commas(cashoutByShopName.get(s.shopName))}円` : ""}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="muted">記録がありません。</td></tr>`;

  container.innerHTML = `
    ${renderFlash()}
    <div class="calendar-header">
      <h1>収支分析</h1>
      <a class="btn btn-sm" href="${buildUrl("/records/list")}">🔍 記録を検索</a>
    </div>

    <h2>収支推移（月別・累計）</h2>
    ${chartHtml}

    <h2>年別集計</h2>
    <table class="simple mb-3"><thead><tr><th>年</th><th>回数</th><th>収支</th></tr></thead><tbody>${yearlyRows}</tbody></table>

    <h2>月別集計（直近12ヶ月）</h2>
    <table class="simple mb-3"><thead><tr><th>年月</th><th>回数</th><th>収支</th></tr></thead><tbody>${monthlyRows}</tbody></table>

    <h2>機種別集計</h2>
    <table class="simple mb-3"><thead><tr><th>機種</th><th>回数</th><th>平均収支</th><th>合計収支</th></tr></thead><tbody>${machineRows}</tbody></table>

    <h2>店舗別集計</h2>
    <table class="simple mb-3"><thead><tr><th>店舗</th><th>来店回数</th><th>合計収支</th><th>貯玉換金額（参考）</th></tr></thead><tbody>${shopRows}</tbody></table>

    ${
      otherAdjustments.length
        ? `<h2>その他調整額（獲得元の記録がない貯玉の換金差額）</h2>
           <ul>${otherAdjustments.map((o) => `<li>${escapeHtml(o.shopName)}：${commas(o.total)}円</li>`).join("")}</ul>`
        : ""
    }
  `;
}
