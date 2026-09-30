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
import { summarizeEstimateHeadline } from "../logic/settingInference.js";
import { fetchDwinData } from "../dwinImport.js";
import { decodeQrFromImageFile } from "../ui/qrScan.js";
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
  const headline = summarizeEstimateHeadline(estimate);
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
      ${
        headline
          ? `<div class="alert" style="margin-bottom:8px;"><strong>${escapeHtml(headline)}</strong></div>`
          : `<div class="small muted" style="margin-bottom:8px;">まだ判断材料がありません。</div>`
      }
      <div class="small" style="margin-bottom:8px;">
        AT初当たり実測：${estimate.observedAtRate !== null ? `${formatRateAsFraction(estimate.observedAtRate)}（${formatPercent(estimate.observedAtRate, 2)}）` : "データ無し"}
        ／
        CZ当選率実測：${estimate.observedCzRate !== null ? formatPercent(estimate.observedCzRate) : "データ無し"}
      </div>
      ${bars}
      ${
        estimate.observedBonusRate !== undefined && estimate.observedBonusRate !== null
          ? `<div class="small muted" style="margin-top:4px;">ボーナス直撃実測：${estimate.observedBonusRate > 0 ? formatRateAsFraction(estimate.observedBonusRate) : "0回"}（推定に反映）</div>`
          : ""
      }
      ${
        estimate.totalGameCount !== undefined && estimate.totalGameCount !== null
          ? `<div class="small muted" style="margin-top:4px;">総ゲーム数：${estimate.totalGameCount}G（参考値。推定には通常ゲーム数のみ使用）</div>`
          : ""
      }
      ${
        estimate.hintMinSetting
          ? `<div class="alert" style="margin-top:8px;">設定${estimate.hintMinSetting}以上が濃厚です。
               <div class="small">${(estimate.minSettingSources || [])
                 .map((s) => `${escapeHtml(s.label)} → 設定${s.minSetting}以上`)
                 .join("<br>")}</div></div>`
          : ""
      }
      ${
        estimate.parityHint && (estimate.parityHint.odd || estimate.parityHint.even)
          ? `<div class="small" style="margin-top:6px;">ボイス示唆：奇数${estimate.parityHint.odd}／偶数${estimate.parityHint.even}（確定ではありません）</div>`
          : ""
      }
      ${
        estimate.strapSummary && estimate.strapSummary.totalCount > 0
          ? `<div class="small" style="margin-top:6px;">設定差ありストラップ（ノブナガ・ゴエモン・ヒデヨシ）出現：<strong>${estimate.strapSummary.settingDiffCount}回</strong>
               <span class="muted">（数値は非公開。多いほど高設定期待）</span></div>`
          : ""
      }
      ${
        estimate.settingChangeHint
          ? `<div class="alert" style="margin-top:8px;">設定変更（据え置きではない）の示唆があります。
               <div class="small">短縮天井（650G／4周期以内）での強制AT当選は、設定変更があった日に起きるとされています。
               設定の高低とは別の情報です。</div></div>`
          : ""
      }
    </div>
  `;
}

function renderPeriodSection(reference, summary) {
  const expectation = reference.PERIOD_AT_EXPECTATION_SETTING1 || [];
  const entryLabel = (e) =>
    e.via === "miko" ? "乙女アタック" : e.display_game !== null && e.display_game !== undefined ? `${e.display_game}G` : "?G";
  const hitRows = summary.hits
    .map(
      (h, i) => `
        <div class="small">初当たり${i + 1}回目：<strong>${h.period}周期目</strong>
          <span class="muted">（${h.entries.map(entryLabel).join(" → ")}）</span></div>`
    )
    .join("");
  const ongoing = summary.ongoing.length
    ? `<div class="small muted">進行中：${summary.ongoing.map(entryLabel).join(" → ")}（すべてハズレ）</div>`
    : "";
  const stats =
    summary.hits.length > 0
      ? `<div class="small" style="margin-top:6px;">平均 ${summary.averageHitPeriod.toFixed(2)}周期目で当選／1周期目当選率 ${formatPercent(summary.firstPeriodHitRate)}
           <span class="muted">（設定1の1周期目期待度は約${Math.round((expectation[0] || 0) * 100)}%、高設定ほど優遇）</span></div>`
      : "";
  return `${hitRows}${ongoing}${stats}`;
}

function renderMikoSection(mikoLog, summary) {
  if (mikoLog.length === 0) return "";
  const rows = mikoLog
    .map(
      (m, i) => `
        <div class="small" style="display:flex;align-items:center;gap:8px;">
          <span>${i + 1}.</span>
          <span>${m.total_game !== null && m.total_game !== undefined ? `${m.total_game}G` : "総G数なし"}</span>
          <strong>${m.won ? "当選" : "ハズレ"}</strong>
          ${m.kansuke ? '<span class="muted">（カンスケ中・判別から除外）</span>' : ""}
          <button type="button" class="btn btn-sm miko-del" data-index="${i}" style="margin-left:auto;">×</button>
        </div>`
    )
    .join("");
  const stats =
    summary && summary.averageInterval
      ? `<div class="small muted" style="margin-top:6px;">平均${Math.round(summary.averageInterval)}G間隔で到達</div>`
      : "";
  return rows + stats;
}

function readForm(container, logs = null) {
  const val = (id) => container.querySelector(`#${id}`).value;
  return {
    ...(logs || {}),
    play_date: val("f-play-date"),
    machine_number: val("f-machine-number"),
    game_count: val("f-game-count"),
    total_game_count: val("f-total-game-count"),
    at_count: val("f-at-count"),
    bonus_direct_count: val("f-bonus-direct-count"),
    miko_reach_count: val("f-miko-reach-count"),
    cz_win_count: val("f-cz-win-count"),
    max_ending_stamp: val("f-max-ending-stamp"),
    max_payout_over: val("f-max-payout-over"),
    ceiling_reset_hint: container.querySelector("#f-ceiling-reset-hint").checked,
    memo: val("f-memo"),
  };
}

export async function renderSettingObservationForm(
  container,
  db,
  { observationId = null, shopId = null, machineId = null, errorMessage = null, formOverride = null } = {}
) {
  let isEdit = observationId !== null;
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
    total_game_count: observation?.total_game_count ?? "", // 空欄＝記録していない（任意項目）
    at_count: observation?.at_count ?? 0,
    bonus_direct_count: observation?.bonus_direct_count ?? "", // 空欄＝数えていない（推定に使わない）
    miko_reach_count: observation?.miko_reach_count ?? 0,
    cz_win_count: observation?.cz_win_count ?? 0,
    max_ending_stamp: observation?.max_ending_stamp ?? "none",
    max_payout_over: observation?.max_payout_over ?? "none",
    ceiling_reset_hint: observation?.ceiling_reset_hint ?? false,
    period_log: observation?.period_log ?? [],
    miko_log: observation?.miko_log ?? [],
    hint_flags: observation?.hint_flags ?? [],
    strap_counts: observation?.strap_counts ?? {},
    memo: observation?.memo ?? "",
  };
  // 周期メモ・巫女ポイント0メモ・示唆チェック・ストラップ回数は画面上で追記していくので、手元に持つ。
  const logs = {
    period_log: [...(values.period_log || [])],
    miko_log: [...(values.miko_log || [])],
    hint_flags: [...(values.hint_flags || [])],
    strap_counts: { ...(values.strap_counts || {}) },
  };
  const strapModes = reference.STRAP_MODES || [];
  const settingHints = reference.SETTING_HINTS || [];
  const hintGroups = [...new Set(settingHints.map((h) => h.group))];

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
      <div class="card" id="dwin-card">
        <h2 style="margin-top:0;">打-WINから読み込む（任意）</h2>
        <div class="hint small muted">
          平和の実機データ確認サービス「打-WIN LITE」のURLを貼るか、QRコードを撮影すると、
          総ゲーム数・通常ゲーム数・終了画面スタンプを自動で反映します。それ以外の項目
          （戦国乙女ボーナス回数など）は用語の意味が完全に一致するか確認できていないため、
          参考表示するだけで自動入力はしません。
        </div>
        <div class="field" style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:10em;">
            <label>打-WINのURL</label>
            <input type="text" id="f-dwin-url" placeholder="https://dwlite.heiwa.jp/...">
          </div>
          <button type="button" class="btn" id="dwin-qr-btn">QRコードを撮影</button>
          <input type="file" id="dwin-qr-file" accept="image/*" capture="environment" style="display:none;">
          <button type="button" class="btn btn-primary" id="dwin-load-btn">読み込む</button>
        </div>
        <div id="dwin-status" class="small muted"></div>
        <div id="dwin-reference"></div>
      </div>
      <div class="field">
        <label>日付</label>
        <input type="date" id="f-play-date" required value="${values.play_date}">
      </div>
      <div class="field">
        <label>台番号（任意）</label>
        <input type="text" id="f-machine-number" value="${escapeHtml(values.machine_number)}">
      </div>
      <div class="field">
        <label>通常ゲーム数</label>
        <input type="number" id="f-game-count" min="0" inputmode="numeric" value="${values.game_count}">
        <div class="hint">AT・ボーナス消化中を除いた、通常時のゲーム数。AT初当たり確率の分母はこちらを使います。</div>
      </div>
      <div class="field">
        <label>総ゲーム数（任意）</label>
        <input type="number" id="f-total-game-count" min="0" inputmode="numeric" placeholder="AT消化分も含めた合計。任意" value="${values.total_game_count ?? ""}">
        <div class="hint">AT・ボーナス消化分も含めた、その日実際に回したゲーム数。記録用の参考値で、推定計算には使いません。</div>
      </div>
      <div class="field">
        <label>AT当選回数（初当たり合計）</label>
        <input type="number" id="f-at-count" min="0" inputmode="numeric" value="${values.at_count}">
        <div class="hint">戦国乙女ボーナス直撃・CZ勝利、どちらでのAT当選も合わせた回数。</div>
      </div>
      <div class="field">
        <label>うち戦国乙女ボーナス直撃回数</label>
        <input type="number" id="f-bonus-direct-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.bonus_direct_count ?? ""}">
        <div class="hint">設定1:1/21206.7〜設定6:1/5502.7と設定差が大きい要素。数えた日は0回でも「0」を入れると推定に反映されます（空欄なら使いません）。</div>
      </div>
      <div class="card" id="period-card">
        <h2 style="margin-top:0;">周期メモ <span class="small muted" id="period-current"></span></h2>
        <div class="field" style="display:flex;gap:6px;align-items:flex-end;">
          <div style="flex:1;">
            <label>液晶の表示G数</label>
            <input type="number" id="f-period-game" min="0" inputmode="numeric" placeholder="例: 100">
          </div>
          <button type="button" class="btn" id="period-miss-btn">ハズレ</button>
          <button type="button" class="btn btn-primary" id="period-hit-btn">AT当選</button>
        </div>
        <div id="period-log"></div>
        <button type="button" class="btn btn-sm" id="period-undo-btn" style="margin-top:6px;">最後の1件を取消</button>
      </div>

      <div class="card" id="miko-card">
        <h2 style="margin-top:0;">巫女ポイント0メモ</h2>
        <div class="field" style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:7em;">
            <label>その時の総G数</label>
            <input type="number" id="f-miko-total-game" min="0" inputmode="numeric" placeholder="例: 1234">
          </div>
          <label class="small" style="display:flex;align-items:center;gap:4px;">
            <input type="checkbox" id="f-miko-kansuke">カンスケ中
          </label>
          <button type="button" class="btn" id="miko-lose-btn">ハズレ</button>
          <button type="button" class="btn btn-primary" id="miko-win-btn">当選</button>
        </div>
        <div class="hint small muted">乙女アタック当選率の解析値はカンスケ滞在時を除いた数値のため、カンスケ中の分は判別から外します。</div>
        <div id="miko-log"></div>
      </div>

      ${
        strapModes.length
          ? `<div class="card" id="strap-card">
        <h2 style="margin-top:0;">乙女ストラップモード</h2>
        <div class="hint small muted">★は設定差ありのキャラ（出現するほど高設定期待）。見えたら＋で数えます。</div>
        ${strapModes
          .map(
            (m) => `
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
            <div style="flex:1;">${m.settingDiff ? "★" : ""}${escapeHtml(m.label)}</div>
            <button type="button" class="btn btn-sm strap-minus" data-key="${m.key}">−</button>
            <div style="width:2em;text-align:center;" id="strap-count-${m.key}">${logs.strap_counts[m.key] || 0}</div>
            <button type="button" class="btn btn-sm btn-primary strap-plus" data-key="${m.key}">＋</button>
          </div>`
          )
          .join("")}
      </div>`
          : ""
      }

      ${
        settingHints.length
          ? `<div class="card" id="hint-card">
        <h2 style="margin-top:0;">見えた設定示唆</h2>
        ${hintGroups
          .map(
            (group) => `
          <div class="small" style="margin-top:6px;font-weight:bold;">${escapeHtml(group)}</div>
          ${settingHints
            .filter((h) => h.group === group)
            .map(
              (h) => `
            <label class="small" style="display:flex;align-items:center;gap:6px;margin:2px 0;">
              <input type="checkbox" class="hint-flag" value="${h.value}" ${logs.hint_flags.includes(h.value) ? "checked" : ""}>
              ${escapeHtml(h.label)}
              <span class="muted">${h.minSetting ? `（設定${h.minSetting}${h.minSetting === 6 ? "" : "以上"}濃厚）` : h.parity === "odd" ? "（奇数示唆）" : "（偶数示唆）"}</span>
            </label>`
            )
            .join("")}`
          )
          .join("")}
      </div>`
          : ""
      }
      <div id="autosave-status" class="small muted"></div>

      <div class="field">
        <label>巫女ポイント0到達回数</label>
        <input type="number" id="f-miko-reach-count" min="0" inputmode="numeric" value="${values.miko_reach_count}">
      </div>
      <div class="field">
        <label>うちCZ（乙女アタック）当選回数</label>
        <input type="number" id="f-cz-win-count" min="0" inputmode="numeric" value="${values.cz_win_count}">
      </div>
      <div class="field">
        <label>ボーナス終了画面スタンプ、その日一番高かったもの</label>
        <select id="f-max-ending-stamp">${stampOptions}</select>
      </div>
      <div class="field">
        <label>終了画面の獲得枚数表示、その日一番高かったもの</label>
        <select id="f-max-payout-over">${payoutOptions}</select>
      </div>
      <div class="field">
        <label class="small" style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="f-ceiling-reset-hint" ${values.ceiling_reset_hint ? "checked" : ""}>
          短縮天井（650G／4周期以内）で強制AT当選するのを見た
        </label>
        <div class="hint">通常の天井は999G・6周期ですが、設定変更があった日はここまで短縮されるとされています。
          設定の高低ではなく「今日、設定が変更された（据え置きではない）」ことの示唆です。</div>
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
    const current = readForm(container, logs);
    const estimate = reference.buildEstimate(current);
    estimatePanel.innerHTML = renderEstimatePanel(reference, estimate);
  }

  /** 周期メモ・巫女メモの表示を描き直し、巫女メモがあれば回数欄をメモからの集計値で上書き（読み取り専用）する。 */
  function refreshLogs() {
    const periodSummary = reference.summarizePeriodLog(logs.period_log);
    $("period-current").textContent = `（次は${periodSummary.currentPeriod}周期目）`;
    $("period-log").innerHTML = renderPeriodSection(reference, periodSummary);
    $("period-undo-btn").style.display = logs.period_log.length ? "" : "none";

    const mikoSummary = reference.summarizeMikoLog(logs.miko_log);
    $("miko-log").innerHTML = renderMikoSection(logs.miko_log, mikoSummary);
    const useMikoLog = logs.miko_log.length > 0;
    if (useMikoLog) {
      $("f-miko-reach-count").value = mikoSummary.reachCount;
      $("f-cz-win-count").value = mikoSummary.winCount;
    }
    $("f-miko-reach-count").readOnly = useMikoLog;
    $("f-cz-win-count").readOnly = useMikoLog;
    container.querySelectorAll(".miko-del").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const [removed] = logs.miko_log.splice(Number(btn.dataset.index), 1);
        // 乙女アタック当選の削除は、周期メモ側に自動で入れた区切りエントリも一緒に取り消す。
        if (removed && removed.won) {
          const linkedIndex = logs.period_log.findIndex((p) => p.linked_miko_id === removed.id);
          if (linkedIndex !== -1) logs.period_log.splice(linkedIndex, 1);
        }
        await onLogChanged();
      })
    );
    updateEstimate();
  }

  /**
   * メモを1件追加・削除するたびに自動保存する（遊技中に保存し忘れて消えないように）。
   * 新規の場合は最初の自動保存で記録を作成し、以後は編集として上書きしていく。
   */
  async function autoSave() {
    const status = $("autosave-status");
    const form = { ...readForm(container, logs), shop_id: shopId, machine_id: machineId, machine_key: reference.MACHINE_KEY };
    try {
      if (isEdit) {
        await updateSettingObservation(db, observationId, form);
      } else {
        observationId = await createSettingObservation(db, form);
        isEdit = true;
        // 再読込しても同じ記録を開けるよう、URLを編集画面のものに差し替える（画面は描き直さない）。
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", buildUrl(`/setting-tool/${observationId}/edit`));
        }
      }
      status.textContent = "自動保存しました。";
    } catch (err) {
      if (err instanceof ValidationError) {
        status.textContent = `自動保存できませんでした：${err.message}`;
      } else {
        throw err;
      }
    }
  }

  async function onLogChanged() {
    refreshLogs();
    await autoSave();
  }

  async function addPeriod(hit) {
    const raw = $("f-period-game").value;
    logs.period_log.push({ display_game: raw === "" ? null : Number(raw), hit });
    $("f-period-game").value = "";
    await onLogChanged();
  }
  $("period-miss-btn").addEventListener("click", () => addPeriod(false));
  $("period-hit-btn").addEventListener("click", () => addPeriod(true));
  $("period-undo-btn").addEventListener("click", async () => {
    const removed = logs.period_log.pop();
    // 乙女アタック当選による自動区切りエントリを取り消す場合は、対応する巫女ポイント0メモも一緒に消す。
    if (removed && removed.linked_miko_id) {
      const mikoIndex = logs.miko_log.findIndex((m) => m.id === removed.linked_miko_id);
      if (mikoIndex !== -1) logs.miko_log.splice(mikoIndex, 1);
    }
    await onLogChanged();
  });

  async function addMiko(won) {
    const raw = $("f-miko-total-game").value;
    const entry = { id: Date.now(), total_game: raw === "" ? null : Number(raw), won, kansuke: $("f-miko-kansuke").checked };
    logs.miko_log.push(entry);
    if (won) {
      // 乙女アタック当選はAT初当たり。次の周期は1周期目から数え直しになるので、周期メモ側にも区切りを入れる。
      logs.period_log.push({ display_game: null, hit: true, via: "miko", linked_miko_id: entry.id });
    }
    $("f-miko-total-game").value = "";
    $("f-miko-kansuke").checked = false;
    await onLogChanged();
  }
  $("miko-win-btn").addEventListener("click", () => addMiko(true));

  // 乙女ストラップ：＋/−で回数を数え、そのたびに自動保存。
  async function changeStrap(key, delta) {
    const next = Math.max(0, (logs.strap_counts[key] || 0) + delta);
    if (next === 0) delete logs.strap_counts[key];
    else logs.strap_counts[key] = next;
    $(`strap-count-${key}`).textContent = String(next);
    updateEstimate();
    await autoSave();
  }
  container.querySelectorAll(".strap-plus").forEach((btn) => btn.addEventListener("click", () => changeStrap(btn.dataset.key, 1)));
  container.querySelectorAll(".strap-minus").forEach((btn) => btn.addEventListener("click", () => changeStrap(btn.dataset.key, -1)));

  // 設定示唆チェック：変えるたびに自動保存。
  container.querySelectorAll(".hint-flag").forEach((cb) =>
    cb.addEventListener("change", async () => {
      logs.hint_flags = Array.from(container.querySelectorAll(".hint-flag:checked")).map((el) => el.value);
      updateEstimate();
      await autoSave();
    })
  );
  $("miko-lose-btn").addEventListener("click", () => addMiko(false));

  // 打-WINから読み込む：総ゲーム数・通常ゲーム数・終了画面スタンプだけ自動反映し、
  // それ以外は「参考データ」として一覧表示するだけ（用語の意味が完全一致するか未確認なため）。
  async function loadDwinData() {
    const url = $("f-dwin-url").value.trim();
    const status = $("dwin-status");
    const refBox = $("dwin-reference");
    refBox.innerHTML = "";
    if (!url) {
      status.textContent = "URLを入力してください。";
      return;
    }
    status.textContent = "読み込み中...";
    try {
      const data = await fetchDwinData(url, reference);
      const filled = [];
      if (data.normalGameCount !== null) {
        $("f-game-count").value = data.normalGameCount;
        filled.push("通常ゲーム数");
      }
      if (data.totalGameCount !== null) {
        $("f-total-game-count").value = data.totalGameCount;
        filled.push("総ゲーム数");
      }
      if (data.maxEndingStamp) {
        $("f-max-ending-stamp").value = data.maxEndingStamp;
        filled.push("終了画面スタンプ");
      }
      ["f-game-count", "f-total-game-count", "f-max-ending-stamp"].forEach((id) => {
        $(id).dispatchEvent(new Event("change", { bubbles: true }));
      });
      status.textContent = filled.length
        ? `反映しました：${filled.join("・")}`
        : "読み込みましたが、反映できる項目が見つかりませんでした。";
      if (data.referenceRows.length) {
        refBox.innerHTML = `
          <div class="small muted" style="margin-top:6px;">参考データ（自動反映はしていません。必要なら見て手入力してください）：</div>
          <div class="small">${data.referenceRows.map((r) => `${escapeHtml(r.label)}：${escapeHtml(r.value)}`).join("<br>")}</div>
        `;
      }
    } catch (err) {
      status.textContent = `読み込めませんでした：${err.message}`;
    }
  }
  $("dwin-load-btn").addEventListener("click", loadDwinData);
  $("dwin-qr-btn").addEventListener("click", () => $("dwin-qr-file").click());
  $("dwin-qr-file").addEventListener("change", async () => {
    const file = $("dwin-qr-file").files[0];
    $("dwin-qr-file").value = ""; // 同じ写真を選び直せるようにリセット
    if (!file) return;
    const status = $("dwin-status");
    status.textContent = "QRコードを読み取り中...";
    try {
      const text = await decodeQrFromImageFile(file);
      if (!text) {
        status.textContent = "QRコードを読み取れませんでした。もう一度試してください。";
        return;
      }
      $("f-dwin-url").value = text;
      await loadDwinData();
    } catch (err) {
      status.textContent = `QRコードの読み取りに失敗しました：${err.message}`;
    }
  });

  [
    "f-game-count",
    "f-total-game-count",
    "f-at-count",
    "f-bonus-direct-count",
    "f-miko-reach-count",
    "f-cz-win-count",
    "f-max-ending-stamp",
    "f-max-payout-over",
    "f-ceiling-reset-hint",
  ].forEach((id) => {
    $(id).addEventListener("input", updateEstimate);
    $(id).addEventListener("change", updateEstimate);
  });
  refreshLogs();

  $("observation-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = { ...readForm(container, logs), shop_id: shopId, machine_id: machineId, machine_key: reference.MACHINE_KEY };
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
        await renderSettingObservationForm(container, db, { observationId, shopId, machineId, errorMessage: err.message, formOverride: readForm(container, logs) });
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
