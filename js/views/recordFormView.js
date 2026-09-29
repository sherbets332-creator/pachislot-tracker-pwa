/**
 * 記録の新規登録・編集フォーム。Flask版 templates/records/form.html + routes/records.py 相当。
 */
import {
  listShops,
  listMachines,
  getShop,
  getMachine,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getShopBalance,
  getShopRealization,
  getInstalledMachineIds,
  ValidationError,
} from "../repository.js";
import { calculateLendingReference } from "../logic/profitCalculator.js";
import { toHalfWidth } from "../logic/validation.js";
import { commas, profitClass, escapeHtml, todayDateString } from "../ui/format.js";
import { setFlash } from "../ui/flash.js";
import { buildUrl, navigate } from "../router.js";

async function getShopsForForm(db, currentShopId) {
  const active = await listShops(db);
  if (currentShopId && !active.some((s) => s.id === currentShopId)) {
    const current = await getShop(db, currentShopId);
    if (current) active.push(current);
  }
  return active.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

async function getMachinesForForm(db, currentMachineId) {
  const active = await listMachines(db);
  if (currentMachineId && !active.some((m) => m.id === currentMachineId)) {
    const current = await getMachine(db, currentMachineId);
    if (current) active.push(current);
  }
  return active.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function readFormValues(container) {
  const val = (id) => container.querySelector(`#${id}`).value;
  return {
    play_date: val("f-play-date"),
    shop_id: val("f-shop-id"),
    machine_id: val("f-machine-id"),
    machine_number: val("f-machine-number"),
    cash_investment: val("f-cash-investment"),
    saved_ball_used: val("f-saved-ball-used"),
    payout_count: val("f-payout-count"),
    saved_ball_earned: val("f-saved-ball-earned"),
    memo: val("f-memo"),
    manual_profit_amount: container.querySelector("#f-manual-toggle").checked ? val("f-manual-profit-amount") : "",
  };
}

export async function renderRecordForm(container, db, { recordId = null, date = null, errorMessage = null, formOverride = null } = {}) {
  const isEdit = recordId !== null;
  let record = null;
  let adjustment = 0;
  if (isEdit) {
    record = await getRecord(db, recordId);
    if (!record) {
      setFlash("記録が見つかりませんでした。");
      navigate("/calendar");
      return;
    }
    const realization = await getShopRealization(db, record.shop_id);
    adjustment = realization.adjustmentsByRecordId.get(recordId) || 0;
  }

  const currentShopId = formOverride ? parseInt(formOverride.shop_id, 10) || null : record?.shop_id ?? null;
  const currentMachineId = formOverride ? parseInt(formOverride.machine_id, 10) || null : record?.machine_id ?? null;
  const shops = await getShopsForForm(db, currentShopId);
  const machines = await getMachinesForForm(db, currentMachineId);
  const balances = new Map();
  const installedByShop = new Map();
  for (const shop of shops) {
    balances.set(shop.id, await getShopBalance(db, shop.id));
    installedByShop.set(shop.id, await getInstalledMachineIds(db, shop.id));
  }

  const values = formOverride || {
    play_date: record?.play_date ?? date ?? todayDateString(),
    shop_id: record?.shop_id ?? "",
    machine_id: record?.machine_id ?? "",
    machine_number: record?.machine_number ?? "",
    cash_investment: record?.cash_investment ?? 0,
    saved_ball_used: record?.saved_ball_used ?? 0,
    payout_count: record?.payout_count ?? 0,
    saved_ball_earned: record?.saved_ball_earned ?? 0,
    memo: record?.memo ?? "",
    manual_profit_amount: record?.profit_is_manual ? record.profit_amount : "",
  };
  const manualChecked = record?.profit_is_manual === 1 || (formOverride && formOverride.manual_profit_amount !== "");

  const shopOptions = shops
    .map((s) => {
      const installed = Array.from(installedByShop.get(s.id) || []).join(",");
      return `<option value="${s.id}" data-rate="${s.exchange_rate}" data-lending-rate="${s.lending_rate}" data-balance="${balances.get(s.id)}" data-installed="${installed}" ${String(s.id) === String(values.shop_id) ? "selected" : ""}>${escapeHtml(s.name)}</option>`;
    })
    .join("");
  const machineOptions = machines
    .map((m) => `<option value="${m.id}" ${String(m.id) === String(values.machine_id) ? "selected" : ""}>${escapeHtml(m.name)}</option>`)
    .join("");

  container.innerHTML = `
    ${errorMessage ? `<div class="alert alert-danger">${escapeHtml(errorMessage)}</div>` : ""}
    <h1>記録${isEdit ? "編集" : "新規登録"}</h1>
    ${
      isEdit && adjustment
        ? `<div class="alert">実現差額調整：${commas(adjustment)}円（この記録が獲得した貯玉の、後日の換金結果による補正）</div>`
        : ""
    }
    <form id="record-form">
      <div class="field">
        <label>日付</label>
        <input type="date" id="f-play-date" required value="${values.play_date}">
      </div>
      <div class="field">
        <label>店舗</label>
        <select id="f-shop-id" required ${shops.length === 0 ? "disabled" : ""}>${shopOptions}</select>
        ${shops.length === 0 ? '<div class="hint" style="color:#dc3545;">先に店舗情報から店舗を登録してください。</div>' : ""}
      </div>
      <div class="field">
        <label>機種名</label>
        <select id="f-machine-id" required ${machines.length === 0 ? "disabled" : ""}>${machineOptions}</select>
        ${machines.length === 0 ? '<div class="hint" style="color:#dc3545;">先に機種情報から機種を登録してください。</div>' : ""}
      </div>
      <div class="field">
        <label>台番号（任意）</label>
        <input type="text" id="f-machine-number" value="${escapeHtml(values.machine_number)}">
      </div>
      <div class="field">
        <label>現金投資（円）</label>
        <div class="input-group">
          <button type="button" class="btn" id="cash-minus">－1000</button>
          <input type="number" id="f-cash-investment" min="0" step="1000" inputmode="numeric" value="${values.cash_investment}">
          <button type="button" class="btn" id="cash-plus">＋1000</button>
        </div>
      </div>
      <div class="field">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <label style="margin:0;">貯玉使用枚数</label>
          <span class="small muted" id="balance-hint"></span>
        </div>
        <input type="number" id="f-saved-ball-used" min="0" inputmode="numeric" value="${values.saved_ball_used}">
      </div>
      <div class="field">
        <label>回収枚数（＝出玉）</label>
        <input type="number" id="f-payout-count" min="0" inputmode="numeric" value="${values.payout_count}">
      </div>
      <div class="field">
        <label>貯玉獲得数</label>
        <input type="number" id="f-saved-ball-earned" min="0" inputmode="numeric" value="${values.saved_ball_earned}">
        <div class="hint">回収枚数のうち貯玉に預けた枚数。どちらかを入力するともう片方に自動で同じ値が入る（手入力後は独立）。</div>
      </div>
      <div class="field">
        <label>メモ</label>
        <textarea id="f-memo" rows="2">${escapeHtml(values.memo)}</textarea>
      </div>

      <div class="card">
        <div class="small muted">収支金額プレビュー（自動計算）</div>
        <div class="fw-bold" id="profit-preview" style="font-size:1.3rem;">-</div>
        <div class="small muted" id="lending-reference"></div>
        <div class="field" style="margin-top:8px;margin-bottom:0;">
          <label><input type="checkbox" id="f-manual-toggle" ${manualChecked ? "checked" : ""}> 自動計算値と異なる金額で確定する</label>
        </div>
        <input type="number" id="f-manual-profit-amount" style="display:${manualChecked ? "block" : "none"};margin-top:8px;" value="${values.manual_profit_amount}">
      </div>

      <button type="submit" class="btn btn-primary">保存</button>
      <a class="btn" href="${buildUrl("/calendar")}">戻る</a>
      ${isEdit ? '<button type="button" class="btn btn-danger" id="delete-record-btn" style="float:right;">削除</button>' : ""}
    </form>
  `;

  const $ = (id) => container.querySelector(`#${id}`);
  const shopSelect = $("f-shop-id");
  const machineSelect = $("f-machine-id");
  const initialMachineValue = String(values.machine_id || "");
  const cashInput = $("f-cash-investment");
  const usedInput = $("f-saved-ball-used");
  const payoutInput = $("f-payout-count");
  const earnedInput = $("f-saved-ball-earned");
  const preview = $("profit-preview");
  const lendingRef = $("lending-reference");
  const balanceHint = $("balance-hint");
  const manualToggle = $("f-manual-toggle");
  const manualInput = $("f-manual-profit-amount");

  let payoutTouched = false;
  let earnedTouched = false;

  function currentShopOption() {
    return shopSelect.options[shopSelect.selectedIndex];
  }

  /**
   * 選択中の店舗に設置機種が設定されていれば、機種セレクトの選択肢をそれだけに絞る。
   * 設置機種が1つも設定されていない店舗（未設定）なら絞り込まない（全機種を表示）。
   * 編集中の記録がもともと使っていた機種は、設置リストから外れていても表示し続ける。
   */
  function applyMachineFilter() {
    const opt = currentShopOption();
    const installedRaw = opt ? opt.dataset.installed || "" : "";
    const installedIds = installedRaw ? new Set(installedRaw.split(",")) : null;
    let visibleCount = 0;
    for (const o of machineSelect.options) {
      const show = !installedIds || installedIds.has(o.value) || o.value === initialMachineValue;
      o.hidden = !show;
      if (show) visibleCount += 1;
    }
    if (visibleCount === 0) {
      // 想定外のデータ不整合時のフォールバック：何も選べなくなるくらいなら全部表示する
      for (const o of machineSelect.options) o.hidden = false;
    }
  }

  function updateBalanceHint() {
    const opt = currentShopOption();
    if (!opt) {
      balanceHint.textContent = "";
      return;
    }
    balanceHint.textContent = `現在の貯玉残高：${commas(opt.dataset.balance)}枚`;
  }

  function updatePreview() {
    const opt = currentShopOption();
    const rate = opt ? parseFloat(opt.dataset.rate || "0") : 0;
    const lendingRate = opt ? parseFloat(opt.dataset.lendingRate || "0") : 0;
    const cash = parseInt(toHalfWidth(cashInput.value || "0"), 10) || 0;
    const used = parseInt(toHalfWidth(usedInput.value || "0"), 10) || 0;
    const payout = parseInt(toHalfWidth(payoutInput.value || "0"), 10) || 0;
    const profit = Math.round(payout * rate - (cash + used * rate));
    preview.textContent = `${profit.toLocaleString()} 円`;
    preview.className = `fw-bold ${profitClass(profit)}`;
    preview.style.fontSize = "1.3rem";
    if (used > 0) {
      lendingRef.textContent = `参考（現金換算）：${calculateLendingReference(used, lendingRate).toLocaleString()}円`;
    } else {
      lendingRef.textContent = "";
    }
  }

  function stepCash(delta) {
    const current = parseInt(toHalfWidth(cashInput.value || "0"), 10) || 0;
    cashInput.value = Math.max(0, current + delta);
    updatePreview();
  }

  $("cash-minus").addEventListener("click", () => stepCash(-1000));
  $("cash-plus").addEventListener("click", () => stepCash(1000));
  cashInput.addEventListener("focus", () => cashInput.select());
  cashInput.addEventListener("blur", () => {
    cashInput.value = parseInt(toHalfWidth(cashInput.value || "0"), 10) || 0;
  });

  payoutInput.addEventListener("input", () => {
    payoutTouched = true;
    if (!earnedTouched) earnedInput.value = payoutInput.value;
    updatePreview();
  });
  earnedInput.addEventListener("input", () => {
    earnedTouched = true;
    if (!payoutTouched) payoutInput.value = earnedInput.value;
    updatePreview();
  });
  [cashInput, usedInput].forEach((el) => el.addEventListener("input", updatePreview));
  shopSelect.addEventListener("change", () => {
    updatePreview();
    updateBalanceHint();
    applyMachineFilter();
  });

  manualToggle.addEventListener("change", () => {
    manualInput.style.display = manualToggle.checked ? "block" : "none";
    if (!manualToggle.checked) manualInput.value = "";
  });

  updatePreview();
  updateBalanceHint();
  applyMachineFilter();

  $("record-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = readFormValues(container);
    try {
      if (isEdit) {
        await updateRecord(db, recordId, form);
        setFlash("記録を更新しました。");
      } else {
        await createRecord(db, form);
        setFlash("記録を保存しました。");
      }
      navigate("/calendar");
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderRecordForm(container, db, { recordId, date, errorMessage: err.message, formOverride: form });
      } else {
        await renderRecordForm(container, db, { recordId, date, errorMessage: `保存できませんでした：${err.message}`, formOverride: form });
      }
    }
  });

  if (isEdit) {
    $("delete-record-btn").addEventListener("click", async () => {
      if (!window.confirm("この記録を削除しますか？")) return;
      try {
        await deleteRecord(db, recordId);
        setFlash("記録を削除しました。");
        navigate("/calendar");
      } catch (err) {
        await renderRecordForm(container, db, { recordId, date, errorMessage: err.message });
      }
    });
  }
}
