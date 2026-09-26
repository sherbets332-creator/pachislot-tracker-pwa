/**
 * 機種の新規登録・編集フォーム。Flask版 templates/machines/form.html 相当。
 */
import {
  getMachine,
  createMachine,
  updateMachine,
  archiveMachine,
  unarchiveMachine,
  deleteMachine,
  machineHasHistory,
  ValidationError,
} from "../repository.js";
import { escapeHtml } from "../ui/format.js";
import { setFlash } from "../ui/flash.js";
import { buildUrl, navigate } from "../router.js";

function readForm(container) {
  const val = (id) => container.querySelector(`#${id}`).value;
  return { name: val("f-name"), maker: val("f-maker"), memo: val("f-memo") };
}

export async function renderMachineForm(container, db, { machineId = null, errorMessage = null, formOverride = null } = {}) {
  const isEdit = machineId !== null;
  let machine = null;
  let hasHistory = false;
  if (isEdit) {
    machine = await getMachine(db, machineId);
    if (!machine) {
      setFlash("機種が見つかりませんでした。");
      navigate("/machines");
      return;
    }
    hasHistory = await machineHasHistory(db, machineId);
  }

  const values = formOverride || { name: machine?.name ?? "", maker: machine?.maker ?? "", memo: machine?.memo ?? "" };

  container.innerHTML = `
    ${errorMessage ? `<div class="alert alert-danger">${escapeHtml(errorMessage)}</div>` : ""}
    <h1>機種${isEdit ? "編集" : "新規登録"}</h1>
    <form id="machine-form">
      <div class="field">
        <label>機種名</label>
        <input type="text" id="f-name" required value="${escapeHtml(values.name)}">
      </div>
      <div class="field">
        <label>メーカー</label>
        <input type="text" id="f-maker" value="${escapeHtml(values.maker)}">
      </div>
      <div class="field">
        <label>メモ</label>
        <textarea id="f-memo" rows="3">${escapeHtml(values.memo)}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">保存</button>
      <a class="btn" href="${buildUrl("/machines")}">戻る</a>
    </form>
    ${
      isEdit
        ? `<div class="mt-3" style="display:flex;gap:8px;flex-wrap:wrap;">
            ${
              machine.is_archived
                ? `<button type="button" class="btn" id="unarchive-btn">一覧に戻す</button>`
                : `<button type="button" class="btn" id="archive-btn">アーカイブする</button>`
            }
            ${
              !hasHistory
                ? `<button type="button" class="btn btn-danger" id="delete-btn">削除</button>`
                : `<span class="small muted" style="align-self:center;">記録があるため削除できません（アーカイブは可能です）。</span>`
            }
          </div>`
        : ""
    }
  `;

  container.querySelector("#machine-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = readForm(container);
    try {
      if (isEdit) {
        await updateMachine(db, machineId, form);
        setFlash("機種を更新しました。");
      } else {
        await createMachine(db, form);
        setFlash("機種を登録しました。");
      }
      navigate("/machines");
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderMachineForm(container, db, { machineId, errorMessage: err.message, formOverride: form });
      } else {
        throw err;
      }
    }
  });

  if (isEdit) {
    const archiveBtn = container.querySelector("#archive-btn");
    if (archiveBtn) {
      archiveBtn.addEventListener("click", async () => {
        if (!window.confirm("アーカイブすると一覧や記録入力の選択肢に出なくなります。記録は残ります。よろしいですか？")) return;
        await archiveMachine(db, machineId);
        setFlash("機種をアーカイブしました。一覧や記録入力の選択肢には出なくなりますが、記録は残ります。");
        navigate("/machines");
      });
    }
    const unarchiveBtn = container.querySelector("#unarchive-btn");
    if (unarchiveBtn) {
      unarchiveBtn.addEventListener("click", async () => {
        await unarchiveMachine(db, machineId);
        setFlash("機種を一覧に戻しました。");
        navigate("/machines");
      });
    }
    const deleteBtn = container.querySelector("#delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm("この機種を削除しますか？（記録がないため復元はできません）")) return;
        try {
          await deleteMachine(db, machineId);
          setFlash("機種を削除しました。");
          navigate("/machines");
        } catch (err) {
          await renderMachineForm(container, db, { machineId, errorMessage: err.message });
        }
      });
    }
  }
}
