/**
 * 店舗ごとの設置機種の管理画面（チェックボックスで一括設定）。
 * Flask版には無い、PWA版独自の画面。
 */
import { getShop, listAllMachines, getInstalledMachineIds, setInstalledMachines } from "../repository.js";
import { setFlash } from "../ui/flash.js";
import { escapeHtml } from "../ui/format.js";
import { buildUrl, navigate } from "../router.js";

export async function renderShopMachines(container, db, shopId) {
  const shop = await getShop(db, shopId);
  if (!shop) {
    setFlash("店舗が見つかりませんでした（削除済みの可能性があります）。");
    navigate("/shops");
    return;
  }

  const machines = await listAllMachines(db);
  const installedIds = await getInstalledMachineIds(db, shopId);

  const rows = machines.length
    ? machines
        .map(
          (m) => `
        <label class="check-row" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee;">
          <input type="checkbox" value="${m.id}" ${installedIds.has(m.id) ? "checked" : ""}>
          <span>${escapeHtml(m.name)}${m.is_archived ? '<span class="small muted">（アーカイブ済み）</span>' : ""}</span>
        </label>`
        )
        .join("")
    : `<p class="muted">機種がまだ登録されていません。先に機種情報から機種を登録してください。</p>`;

  container.innerHTML = `
    <h1>設置機種の設定（${escapeHtml(shop.name)}）</h1>
    <p class="muted small">
      この店舗に実際にある機種だけをチェックしてください。記録入力時の機種選択肢がここで選んだものに絞られます。
      1つもチェックしない場合は絞り込みなし（全機種から選べる状態）になります。
    </p>
    <form id="shop-machines-form">
      <div id="machine-checklist">${rows}</div>
      <div style="margin-top:16px;">
        <button type="submit" class="btn btn-primary">保存</button>
        <a class="btn" href="${buildUrl(`/shops/${shopId}`)}">戻る</a>
      </div>
    </form>
  `;

  container.querySelector("#shop-machines-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const checked = Array.from(container.querySelectorAll("#machine-checklist input[type=checkbox]:checked")).map((el) =>
      Number(el.value)
    );
    await setInstalledMachines(db, shopId, checked);
    setFlash("設置機種を更新しました。");
    navigate(`/shops/${shopId}`);
  });
}
