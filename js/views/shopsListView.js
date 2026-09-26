/**
 * 店舗情報一覧。Flask版 templates/shops/index.html 相当。
 */
import { listShops, getShopBalance, unarchiveShop } from "../repository.js";
import { renderFlash, setFlash } from "../ui/flash.js";
import { commas, escapeHtml } from "../ui/format.js";
import { buildUrl } from "../router.js";

export async function renderShopsList(container, db, query) {
  const showArchived = query.get("archived") === "1";
  const shops = await listShops(db, { includeArchived: showArchived });
  const balances = new Map();
  for (const s of shops) balances.set(s.id, await getShopBalance(db, s.id));

  const listHtml = shops.length
    ? `<div class="list">${shops
        .map(
          (s) => `
      <div class="list-item">
        <a class="body" href="${buildUrl(`/shops/${s.id}`)}" style="text-decoration:none;color:inherit;">
          <div class="fw-bold">${escapeHtml(s.name)}</div>
          <div class="small muted">換金 ${s.exchange_rate}円/枚 ／ 貸出 ${s.lending_rate}円/枚</div>
        </a>
        <div class="text-end" style="margin-left:8px;">
          <div class="small muted">貯玉残高</div>
          <div class="fw-bold">${commas(balances.get(s.id))} 枚</div>
        </div>
        ${
          showArchived
            ? `<button type="button" class="btn btn-sm unarchive-btn" data-id="${s.id}" style="margin-left:8px;">一覧に戻す</button>`
            : ""
        }
      </div>`
        )
        .join("")}</div>`
    : `<p class="muted">${showArchived ? "アーカイブ済みの店舗はありません。" : "まだ店舗が登録されていません。"}</p>`;

  container.innerHTML = `
    ${renderFlash()}
    <div class="calendar-header">
      <h1>店舗情報${showArchived ? "（アーカイブ済み）" : ""}</h1>
      ${!showArchived ? `<a class="btn btn-primary btn-sm" href="${buildUrl("/shops/new")}">+ 新規登録</a>` : ""}
    </div>
    ${listHtml}
    <div class="mt-3">
      ${
        showArchived
          ? `<a href="${buildUrl("/shops")}">← 一覧に戻る</a>`
          : `<a class="small muted" href="${buildUrl("/shops", { archived: 1 })}">アーカイブ済みの店舗を表示</a>`
      }
    </div>
  `;

  container.querySelectorAll(".unarchive-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await unarchiveShop(db, Number(btn.dataset.id));
      setFlash("店舗を一覧に戻しました。");
      await renderShopsList(container, db, query);
    });
  });
}
