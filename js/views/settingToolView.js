/**
 * 設定判別参考ツールのトップ画面。店舗・機種（対応機種のみ）を選ぶと、
 * その店舗・機種の過去の観測記録一覧が出る。Flask版には無い、PWA版独自の画面。
 */
import { listAllShops, listAllMachines, listSettingObservations } from "../repository.js";
import { getReferenceByMachineName, REFERENCES } from "../logic/settingReference/index.js";
import { summarizeEstimateHeadline } from "../logic/settingInference.js";
import { commas, escapeHtml } from "../ui/format.js";
import { buildUrl, navigate } from "../router.js";
import { renderFlash } from "../ui/flash.js";

export async function renderSettingTool(container, db, query) {
  const shops = await listAllShops(db);
  const allMachines = await listAllMachines(db);
  const supportedMachines = allMachines.filter((m) => getReferenceByMachineName(m.name));

  const shopId = query.get("shop_id") ? Number(query.get("shop_id")) : null;
  const machineId = query.get("machine_id") ? Number(query.get("machine_id")) : null;

  const shopOptions = [
    `<option value="">（店舗を選択）</option>`,
    ...shops.map((s) => `<option value="${s.id}" ${s.id === shopId ? "selected" : ""}>${escapeHtml(s.name)}</option>`),
  ].join("");
  const machineOptions = [
    `<option value="">（機種を選択）</option>`,
    ...supportedMachines.map(
      (m) => `<option value="${m.id}" ${m.id === machineId ? "selected" : ""}>${escapeHtml(m.name)}</option>`
    ),
  ].join("");

  let bodyHtml = "";
  if (supportedMachines.length === 0) {
    const supportedNames = REFERENCES.map((r) => r.MACHINE_NAME).join("、");
    bodyHtml = `<p class="muted">
      対応している機種がまだ登録されていません。現在対応しているのは「${escapeHtml(supportedNames)}」のみです。
      機種情報でこの名前と完全に一致する機種を登録してください。
    </p>`;
  } else if (shopId && machineId) {
    const machine = allMachines.find((m) => m.id === machineId);
    const reference = machine ? getReferenceByMachineName(machine.name) : null;
    if (!reference) {
      bodyHtml = `<p class="muted">この機種は設定判別ツールに対応していません。</p>`;
    } else {
      const observations = await listSettingObservations(db, { shopId, machineId });
      const listHtml = observations.length
        ? `<div class="list">${observations
            .map((o) => {
              const headline = summarizeEstimateHeadline(reference.buildEstimate(o));
              return `
            <a class="list-item" href="${buildUrl(`/setting-tool/${o.id}/edit`)}" style="text-decoration:none;color:inherit;display:block;">
              <div class="fw-bold">${o.play_date}${o.machine_number ? `（台番 ${escapeHtml(o.machine_number)}）` : ""}</div>
              <div class="small muted">
                G数${commas(o.game_count)} ／ AT ${o.at_count}回 ／ CZ ${o.cz_win_count}回
                ${o.max_ending_stamp && o.max_ending_stamp !== "none" ? ` ／ 終了画面示唆あり` : ""}
              </div>
              ${headline ? `<div class="small" style="margin-top:2px;"><strong>${escapeHtml(headline)}</strong></div>` : ""}
            </a>`;
            })
            .join("")}</div>`
        : `<p class="muted">まだこの店舗・機種の記録はありません。</p>`;

      bodyHtml = `
        <div class="calendar-header">
          <h2 style="margin:0;">${escapeHtml(machine.name)}の観測記録</h2>
          <a class="btn btn-primary btn-sm" href="${buildUrl("/setting-tool/new", { shop_id: shopId, machine_id: machineId })}">+ 新規記録</a>
        </div>
        ${listHtml}
      `;
    }
  } else {
    bodyHtml = `<p class="muted small">店舗と機種を選ぶと、過去の観測記録が表示されます。</p>`;
  }

  container.innerHTML = `
    ${renderFlash()}
    <h1>設定判別ツール</h1>
    <p class="small muted">
      機種ごとに公開されている設定判別要素の理論値と、実際に遊技しながら数えた数値を突き合わせて
      「どの設定っぽいか」の目安を出す参考ツールです。あくまで参考であり、断定はできません。
    </p>
    <div class="field">
      <label>店舗</label>
      <select id="f-shop-id">${shopOptions}</select>
    </div>
    <div class="field">
      <label>機種（対応機種のみ表示）</label>
      <select id="f-machine-id" ${supportedMachines.length === 0 ? "disabled" : ""}>${machineOptions}</select>
    </div>
    ${bodyHtml}
  `;

  function goToSelection() {
    const newShopId = container.querySelector("#f-shop-id").value;
    const newMachineId = container.querySelector("#f-machine-id").value;
    navigate("/setting-tool", { shop_id: newShopId, machine_id: newMachineId });
  }
  container.querySelector("#f-shop-id").addEventListener("change", goToSelection);
  const machineSelect = container.querySelector("#f-machine-id");
  if (machineSelect) machineSelect.addEventListener("change", goToSelection);
}
