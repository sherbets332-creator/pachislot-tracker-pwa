/**
 * 日別の記録一覧。Flask版 templates/records/day.html 相当。
 */
import { getRecordsForDate, computeDisplayProfits, getShop, getMachine, deleteRecord } from "../repository.js";
import { commas, profitClass, escapeHtml } from "../ui/format.js";
import { renderFlash, setFlash } from "../ui/flash.js";
import { buildUrl, navigate } from "../router.js";

export async function renderRecordsDay(container, db, date) {
  const records = await getRecordsForDate(db, date);
  const displayProfits = await computeDisplayProfits(db, records);

  const rows = [];
  for (const record of records) {
    const shop = await getShop(db, record.shop_id);
    const machine = await getMachine(db, record.machine_id);
    const displayProfit = displayProfits.get(record.id) ?? record.profit_amount;
    rows.push({ record, shopName: shop ? shop.name : "(不明)", machineName: machine ? machine.name : "(不明)", displayProfit });
  }

  const listHtml = rows.length
    ? `<div class="list">${rows
        .map(
          ({ record, shopName, machineName, displayProfit }) => `
      <div class="list-item">
        <a class="body" href="${buildUrl(`/records/${record.id}/edit`)}" style="text-decoration:none;color:inherit;">
          <div class="fw-bold">${escapeHtml(shopName)} ／ ${escapeHtml(machineName)}</div>
          <div class="small muted">
            投資${commas(record.cash_investment)}円
            ${record.saved_ball_used ? ` + 貯玉${commas(record.saved_ball_used)}枚` : ""}
            ／ 回収${commas(record.payout_count)}枚
          </div>
        </a>
        <div class="text-end" style="margin-left:8px;">
          <div class="fw-bold ${profitClass(displayProfit)}">${commas(displayProfit)}円</div>
        </div>
        <div class="menu-wrap" style="margin-left:8px;">
          <button type="button" class="btn btn-sm menu-toggle" data-id="${record.id}">⋮</button>
          <div class="menu-popup hidden" data-menu-for="${record.id}">
            <button type="button" class="btn btn-sm btn-danger btn-block delete-btn" data-id="${record.id}">削除</button>
          </div>
        </div>
      </div>`
        )
        .join("")}</div>`
    : `<p class="muted">この日の記録はまだありません。</p>`;

  container.innerHTML = `
    ${renderFlash()}
    <div class="calendar-header">
      <h1>${date} の記録</h1>
      <a class="btn btn-primary btn-sm" href="${buildUrl("/records/new", { date })}">+ 新規登録</a>
    </div>
    ${listHtml}
    <a class="btn mt-3" href="${buildUrl("/calendar")}">カレンダーに戻る</a>
  `;

  container.querySelectorAll(".menu-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      container.querySelectorAll(".menu-popup").forEach((menu) => {
        if (menu.dataset.menuFor === id) menu.classList.toggle("hidden");
        else menu.classList.add("hidden");
      });
    });
  });
  document.addEventListener("click", () => {
    container.querySelectorAll(".menu-popup").forEach((menu) => menu.classList.add("hidden"));
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!window.confirm("この記録を削除しますか？")) return;
      const recordId = Number(btn.dataset.id);
      try {
        await deleteRecord(db, recordId);
        setFlash("記録を削除しました。");
        navigate(`/records/day/${date}`);
        // ハッシュが変わらない場合（同じURLへの遷移）はhashchangeが発火しないため、明示的に再描画する
        await renderRecordsDay(container, db, date);
      } catch (err) {
        setFlash(err.message || "削除できませんでした。");
        await renderRecordsDay(container, db, date);
      }
    });
  });
}
