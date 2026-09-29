/**
 * 記録の検索・フィルター画面。店舗・機種・期間で絞り込んで一覧表示する。
 * 収支分析ページの機種別・店舗別の行や、店舗・機種マスタからもここへリンクできる。
 */
import { listAllShops, listAllMachines, searchRecords } from "../repository.js";
import { commas, profitClass, escapeHtml } from "../ui/format.js";
import { renderFlash } from "../ui/flash.js";
import { buildUrl, navigate } from "../router.js";

function parseIdParam(query, key) {
  const raw = query.get(key);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

export async function renderRecordsList(container, db, query) {
  const shopId = parseIdParam(query, "shop_id");
  const machineId = parseIdParam(query, "machine_id");
  const dateFrom = query.get("date_from") || "";
  const dateTo = query.get("date_to") || "";

  // アーカイブ済みでも過去の記録は絞り込めるよう、絞り込み用の選択肢には両方含める
  const shops = await listAllShops(db);
  const machines = await listAllMachines(db);
  const records = await searchRecords(db, { shopId, machineId, dateFrom: dateFrom || null, dateTo: dateTo || null });

  const totalProfit = records.reduce((sum, r) => sum + r.display_profit, 0);

  const shopOptions = shops
    .map((s) => `<option value="${s.id}" ${s.id === shopId ? "selected" : ""}>${escapeHtml(s.name)}</option>`)
    .join("");
  const machineOptions = machines
    .map((m) => `<option value="${m.id}" ${m.id === machineId ? "selected" : ""}>${escapeHtml(m.name)}</option>`)
    .join("");

  const shopNameById = new Map(shops.map((s) => [s.id, s.name]));
  const machineNameById = new Map(machines.map((m) => [m.id, m.name]));

  const listHtml = records.length
    ? `<div class="list">${records
        .map(
          (r) => `
      <a class="list-item" href="${buildUrl(`/records/${r.id}/edit`)}" style="text-decoration:none;color:inherit;">
        <div class="body">
          <div class="fw-bold">${r.play_date}</div>
          <div class="small muted">${escapeHtml(shopNameById.get(r.shop_id) ?? "(不明)")} ／ ${escapeHtml(machineNameById.get(r.machine_id) ?? "(不明)")}</div>
        </div>
        <div class="fw-bold ${profitClass(r.display_profit)}">${commas(r.display_profit)}円</div>
      </a>`
        )
        .join("")}</div>`
    : `<p class="muted">条件に合う記録がありません。</p>`;

  container.innerHTML = `
    ${renderFlash()}
    <h1>記録の検索</h1>
    <form id="filter-form" class="card">
      <div class="field">
        <label>店舗</label>
        <select id="f-shop">
          <option value="">すべて</option>
          ${shopOptions}
        </select>
      </div>
      <div class="field">
        <label>機種</label>
        <select id="f-machine">
          <option value="">すべて</option>
          ${machineOptions}
        </select>
      </div>
      <div class="field">
        <label>期間</label>
        <div class="input-group">
          <input type="date" id="f-date-from" value="${dateFrom}">
          <span class="muted small" style="align-self:center;">〜</span>
          <input type="date" id="f-date-to" value="${dateTo}">
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">絞り込む</button>
      ${shopId || machineId || dateFrom || dateTo ? `<a class="btn btn-block mt-2" href="${buildUrl("/records/list")}">条件をクリア</a>` : ""}
    </form>

    <div class="card text-center">
      <span class="small muted">${records.length}件・合計収支</span>
      <div class="fw-bold ${profitClass(totalProfit)}" style="font-size:1.3rem;">${commas(totalProfit)} 円</div>
    </div>

    ${listHtml}
  `;

  container.querySelector("#filter-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const newShopId = container.querySelector("#f-shop").value;
    const newMachineId = container.querySelector("#f-machine").value;
    const newDateFrom = container.querySelector("#f-date-from").value;
    const newDateTo = container.querySelector("#f-date-to").value;
    navigate("/records/list", {
      shop_id: newShopId || undefined,
      machine_id: newMachineId || undefined,
      date_from: newDateFrom || undefined,
      date_to: newDateTo || undefined,
    });
  });
}
