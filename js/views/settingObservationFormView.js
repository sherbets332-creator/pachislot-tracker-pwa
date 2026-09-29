/**
 * 設定判別ツールの観測記録：新規登録・編集フォーム。Flask版には無い、PWA版独自の画面。
 *
 * 入力しながら、対象機種のリファレンス（js/logic/settingReference/）を使って
 * その場で「どの設定っぽいか」の簡易推定をプレビュー表示する。
 */
import {
  getShop,
  getMachine,
  getSettingObservation,
  createSettingObservation,
  updateSettingObservation,
  deleteSettingObservation,
  ValidationError,
} from "../repository.js";
import { getReferenceByMachineName } from "../logic/settingReference/index.js";
import { escapeHtml, todayDateString } from "../ui/format.js";
import { setFlash } from "../ui/flash.js";
import { buildUrl, navigate } from "../router.js";

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatRateAsFraction(value) {
  if (!value) return "-";
  return `1/${(1 / value).toFixed(1)}`;
}

function renderEstimatePanel(reference, estimate) {
  const bars = estimate.settingLabels
    .map((label, i) => {
      const pct = estimate.likelihoods[i] * 100;
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="width:3.5em;" class="small">${label}</div>
          <div style="flex:1;background:#eee;border-radius:4px;overflow:hidden;height:14px;">
            <div style="width:${pct.toFixed(1)}%;background:#0d6efd;height:100%;"></div>
          </div>
          <div style="width:3.5em;text-align:right;" class="small muted">${pct.toFixed(1)}%</div>
        </div>`;
    })
    .join("");

  return `
    <div class="card">
      <h2 style="margin-top:0;">推定（参考値）</h2>
      <p class="small muted">
        AT初当たり確率とCZ当選率の理論値に対して、入力した実測値がどれくらい起こりやすいかを
        設定1〜6で相対比較しただけの簡易的な目安です。断定はできません。
      </p>
      <div class="small" style="margin-bottom:8px;">
        AT初当たり実測：${estimate.observedAtRate !== null ? `${formatRateAsFraction(estimate.observedAtRate)}（${formatPercent(estimate.observedAtRate, 2)}）` : "データ無し"}
        ／
        CZ当選率実測：${estimate.observedCzRate !== null ? formatPercent(estimate.observedCzRate) : "データ無し"}
      </div>
      ${bars}
      ${
        estimate.hintMinSetting
          ? `<div class="alert" style="margin-top:8px;">終了画面の示唆から、設定${estimate.hintMinSetting}以上が濃厚です。</div>`
          : ""
      }
    </div>
  `;
}

function readForm(container) {
  const val = (id) => container.querySelector(`#${id}`).value;
  return {
    play_date: val("f-play-date"),
    machine_number: val("f-machine-number"),
    game_count: val("f-game-count"),
    at_count: val("f-at-count"),
    bonus_direct_count: val("f-bonus-direct-count"),
    miko_reach_count: val("f-miko-reach-count"),
    cz_win_count: val("f-cz-win-count"),
    max_ending_stamp: val("f-max-ending-stamp"),
    max_payout_over: val("f-max-payout-over"),
    memo: val("f-memo"),
  };
}

export async function renderSettingObservationForm(
  container,
  db,
  { observationId = null, shopId = null, machineId = null, errorMessage = null, formOverride = null } = {}
) {
  const isEdit = observationId !== null;
  let observation = null;
  if (isEdit) {
    observation = await getSettingObservation(db, observationId);
    if (!observation) {
      setFlash("観測記録が見つかりませんでした。");
      navigate("/setting-tool");
      return;
    }
    shopId = observation.shop_id;
    machineId = observation.machine_id;
  }

  const shop = shopId ? await getShop(db, shopId) : null;
  const machine = machineId ? await getMachine(db, machineId) : null;
  if (!shop || !machine) {
    setFlash("店舗・機種の情報が見つかりませんでした。");
    navigate("/setting-tool");
    return;
  }
  const reference = getReferenceByMachineName(machine.name);
  if (!reference) {
    setFlash("この機種は設定判別ツールに対応していません。");
    navigate("/setting-tool");
    return;
  }

  const values = formOverride || {
    play_date: observation?.play_date ?? todayDateString(),
    machine_number: observation?.machine_number ?? "",
    game_count: observation?.game_count ?? 0,
    at_count: observation?.at_count ?? 0,
    bonus_direct_count: observation?.bonus_direct_count ?? 0,
    miko_reach_count: observation?.miko_reach_count ?? 0,
    cz_win_count: observation?.cz_win_count ?? 0,
    max_ending_stamp: observation?.max_ending_stamp ?? "none",
    max_payout_over: observation?.max_payout_over ?? "none",
    memo: observation?.memo ?? "",
  };

  const stampOptions = reference.ENDING_STAMPS.map(
    (s) => `<option value="${s.value}" ${s.value === values.max_ending_stamp ? "selected" : ""}>${escapeHtml(s.label)}</option>`
  ).join("");
  const payoutOptions = reference.PAYOUT_OVER_HINTS.map(
    (p) => `<option value="${p.value}" ${p.value === values.max_payout_over ? "selected" : ""}>${escapeHtml(p.label)}</option>`
  ).join("");

  container.innerHTML = `
    ${errorMessage ? `<div class="alert alert-danger">${escapeHtml(errorMessage)}</div>` : ""}
    <h1>${escapeHtml(machine.name)}の観測記録${isEdit ? "編集" : "新規登録"}</h1>
    <p class="muted small">${escapeHtml(shop.name)}</p>
    <form id="observation-form">
      <div class="field">
        <label>日付</label>
        <input type="date" id="f-play-date" required value="${values.play_date}">
      </div>
      <div class="field">
        <label>台番号（任意）</label>
        <input type="text" id="f-machine-number" value="${escapeHtml(values.machine_number)}">
      </div>
      <div class="field">
        <label>消化ゲーム数</label>
        <input type="number" id="f-game-count" min="0" inputmode="numeric" value="${values.game_count}">
      </div>
      <div class="field">
        <label>AT当選回数（初当たり合計）</label>
        <input type="number" id="f-at-count" min="0" inputmode="numeric" value="${values.at_count}">
        <div class="hint">戦国乙女ボーナス直撃・CZ勝利、どちらでのAT当選も合わせた回数。</div>
      </div>
      <div class="field">
        <label>うち戦国乙女ボーナス直撃回数（任意・参考）</label>
        <input type="number" id="f-bonus-direct-count" min="0" inputmode="numeric" value="${values.bonus_direct_count}">
      </div>
      <div class="field">
        <label>巫女ポイント0到達回数</label>
        <input type="number" id="f-miko-reach-count" min="0" inputmode="numeric" value="${values.miko_reach_count}">
      </div>
      <div class="field">
        <label>うちCZ（乙女アタック）当選回数</label>
        <input type="number" id="f-cz-win-count" min="0" inputmode="numeric" value="${values.cz_win_count}">
      </div>
      <div class="field">
        <label>AT終了画面スタンプ、その日一番高かったもの</label>
        <select id="f-max-ending-stamp">${stampOptions}</select>
      </div>
      <div class="field">
        <label>AT終了画面の獲得枚数表示、その日一番高かったもの</label>
        <select id="f-max-payout-over">${payoutOptions}</select>
      </div>
      <div class="field">
        <label>メモ</label>
        <textarea id="f-memo" rows="2">${escapeHtml(values.memo)}</textarea>
      </div>

      <div id="estimate-panel"></div>

      <button type="submit" class="btn btn-primary">保存</button>
      <a class="btn" href="${buildUrl("/setting-tool", { shop_id: shopId, machine_id: machineId })}">戻る</a>
      ${isEdit ? '<button type="button" class="btn btn-danger" id="delete-btn" style="float:right;">削除</button>' : ""}
    </form>
  `;

  const $ = (id) => container.querySelector(`#${id}`);
  const estimatePanel = $("estimate-panel");

  function updateEstimate() {
    const current = readForm(container);
    const estimate = reference.buildEstimate(current);
    estimatePanel.innerHTML = renderEstimatePanel(reference, estimate);
  }

  [
    "f-game-count",
    "f-at-count",
    "f-bonus-direct-count",
    "f-miko-reach-count",
    "f-cz-win-count",
    "f-max-ending-stamp",
    "f-max-payout-over",
  ].forEach((id) => {
    $(id).addEventListener("input", updateEstimate);
    $(id).addEventListener("change", updateEstimate);
  });
  updateEstimate();

  $("observation-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = { ...readForm(container), shop_id: shopId, machine_id: machineId, machine_key: reference.MACHINE_KEY };
    try {
      if (isEdit) {
        await updateSettingObservation(db, observationId, form);
        setFlash("観測記録を更新しました。");
      } else {
        await createSettingObservation(db, form);
        setFlash("観測記録を保存しました。");
      }
      navigate("/setting-tool", { shop_id: shopId, machine_id: machineId });
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderSettingObservationForm(container, db, { observationId, shopId, machineId, errorMessage: err.message, formOverride: readForm(container) });
      } else {
        throw err;
      }
    }
  });

  if (isEdit) {
    $("delete-btn").addEventListener("click", async () => {
      if (!window.confirm("この観測記録を削除しますか？")) return;
      await deleteSettingObservation(db, observationId);
      setFlash("観測記録を削除しました。");
      navigate("/setting-tool", { shop_id: shopId, machine_id: machineId });
    });
  }
}
