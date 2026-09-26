/**
 * 機種情報一覧。Flask版 templates/machines/index.html 相当。
 */
import { listMachines, unarchiveMachine } from "../repository.js";
import { renderFlash, setFlash } from "../ui/flash.js";
import { escapeHtml } from "../ui/format.js";
import { buildUrl } from "../router.js";

export async function renderMachinesList(container, db, query) {
  const showArchived = query.get("archived") === "1";
  const machines = await listMachines(db, { includeArchived: showArchived });

  const listHtml = machines.length
    ? `<div class="list">${machines
        .map(
          (m) => `
      <div class="list-item">
        <a class="body" href="${buildUrl(`/machines/${m.id}/edit`)}" style="text-decoration:none;color:inherit;">
          <div class="fw-bold">${escapeHtml(m.name)}</div>
          ${m.maker ? `<div class="small muted">${escapeHtml(m.maker)}</div>` : ""}
        </a>
        ${showArchived ? `<button type="button" class="btn btn-sm unarchive-btn" data-id="${m.id}">一覧に戻す</button>` : ""}
      </div>`
        )
        .join("")}</div>`
    : `<p class="muted">${showArchived ? "アーカイブ済みの機種はありません。" : "まだ機種が登録されていません。"}</p>`;

  container.innerHTML = `
    ${renderFlash()}
    <div class="calendar-header">
      <h1>機種情報${showArchived ? "（アーカイブ済み）" : ""}</h1>
      ${!showArchived ? `<a class="btn btn-primary btn-sm" href="${buildUrl("/machines/new")}">+ 新規登録</a>` : ""}
    </div>
    ${listHtml}
    <div class="mt-3">
      ${
        showArchived
          ? `<a href="${buildUrl("/machines")}">← 一覧に戻る</a>`
          : `<a class="small muted" href="${buildUrl("/machines", { archived: 1 })}">アーカイブ済みの機種を表示</a>`
      }
    </div>
  `;

  container.querySelectorAll(".unarchive-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await unarchiveMachine(db, Number(btn.dataset.id));
      setFlash("機種を一覧に戻しました。");
      await renderMachinesList(container, db, query);
    });
  });
}
