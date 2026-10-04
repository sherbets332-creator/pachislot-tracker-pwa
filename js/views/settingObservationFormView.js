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
import { summarizeEstimateHeadline, buildEstimateWithHints } from "../logic/settingInference.js";
import { fetchDwinData } from "../dwinImport.js";
import { decodeQrFromImageFile } from "../ui/qrScan.js";
import { escapeHtml, todayDateString } from "../ui/format.js";
import { setFlash } from "../ui/flash.js";
import {
  buildAnonymousObservationExport,
  buildAnonymousExportFilename,
  EXPORT_DESCRIPTION,
} from "../logic/anonymousExport.js";
import { buildUrl, navigate } from "../router.js";

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * 画面の一部を描き直す処理を実行し、スクロール位置が勝手に動いていたら元に戻す。
 * 入力のたびに推定パネル・メモ欄を描き直すので、高さが変わった拍子に画面が最下部まで
 * 飛ぶ現象（iPhone Safari）の対策。
 */
function keepScrollPosition(update) {
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  update();
  if (Math.abs(window.scrollY - scrollY) > 1 || window.scrollX !== scrollX) {
    window.scrollTo(scrollX, scrollY);
  }
}

function formatRateAsFraction(value) {
  if (!value) return "-";
  return `1/${(1 / value).toFixed(1)}`;
}

function renderLikelihoodBars(settingLabels, likelihoods) {
  return settingLabels
    .map((label, i) => {
      const pct = (likelihoods[i] || 0) * 100;
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="width:3.5em;" class="small">${escapeHtml(label)}</div>
          <div style="flex:1;background:#eee;border-radius:4px;overflow:hidden;height:14px;">
            <div style="width:${pct.toFixed(1)}%;background:#0d6efd;height:100%;"></div>
          </div>
          <div style="width:3.5em;text-align:right;" class="small muted">${pct.toFixed(1)}%</div>
        </div>`;
    })
    .join("");
}

const STRENGTH_LABELS = { weak: "弱（ほぼ平ら）", medium: "中", strong: "強" };

/** 要素ごとの内訳：その要素だけを見たとき、どの設定寄りか・どれくらい判別力があるか。 */
function renderContributions(estimate) {
  const rows = (estimate.contributions || []).map((c) => {
    const best = (estimate.settingLabels || [])[c.bestIndex] ?? "";
    const observed = c.k !== undefined ? `${c.k}/${c.n}` : "";
    const percents = (c.likelihoods || []).map((v) => Math.round((v || 0) * 100)).join("／");
    const direction = c.strength === "weak" ? "どの設定とも言えない" : `${best}寄り`;
    return `
      <div style="margin-bottom:6px;">
        <div class="small"><strong>${escapeHtml(c.label)}</strong>　${escapeHtml(observed)}（${c.observedRate >= 0.05 ? formatPercent(c.observedRate) : formatRateAsFraction(c.observedRate)}）</div>
        <div class="small">→ ${escapeHtml(direction)}　判別力：${STRENGTH_LABELS[c.strength]}</div>
        <div class="small muted">設定1〜6：${percents}（%）</div>
      </div>`;
  });
  if (rows.length === 0) return "";
  return `
    <div style="margin-top:10px;">
      <div class="fw-bold" style="margin-bottom:4px;">要素ごとの内訳</div>
      <div class="small muted" style="margin-bottom:6px;">各要素だけを見たときの傾向です。「弱」はサンプルが少なくて、ほぼ何も言えない要素です。</div>
      ${rows.join("")}
    </div>`;
}

function renderEstimatePanel(reference, estimate) {
  const headline = summarizeEstimateHeadline(estimate);
  const observedSummary = estimate.observedMetrics
    ? estimate.observedMetrics
        .map((metric) => {
          const value =
            metric.value === null || metric.value === undefined
              ? "データ無し"
              : metric.format === "percent"
                ? formatPercent(metric.value)
                : formatRateAsFraction(metric.value);
          return `${escapeHtml(metric.label)}：${value}`;
        })
        .join("／")
    : `AT初当たり実測：${estimate.observedAtRate !== null ? `${formatRateAsFraction(estimate.observedAtRate)}（${formatPercent(estimate.observedAtRate, 2)}）` : "データ無し"}
        ／
        CZ当選率実測：${estimate.observedCzRate !== null ? formatPercent(estimate.observedCzRate) : "データ無し"}`;
  const bars = renderLikelihoodBars(estimate.settingLabels, estimate.likelihoods);
  const confirmedNote = estimate.confirmedSetting
    ? `<div class="alert" style="margin-top:8px;">設定${estimate.confirmedSetting}濃厚の示唆があるため、上のバーは設定${estimate.confirmedSetting}に固定しています。示唆を除いた、数値だけの推定は次のとおりです。
        ${renderLikelihoodBars(estimate.settingLabels, estimate.rawLikelihoods || [])}</div>`
    : "";

  return `
    <div class="card">
      <h2 style="margin-top:0;">推定（参考値）</h2>
      <p class="small muted">
        ${escapeHtml(
          reference.ESTIMATE_DESCRIPTION ||
            "AT初当たり確率とCZ当選率の理論値に対して、入力した実測値がどれくらい起こりやすいかを設定1〜6で相対比較しただけの簡易的な目安です。断定はできません。"
        )}
      </p>
      ${
        headline
          ? `<div class="alert" style="margin-bottom:8px;"><strong>${escapeHtml(headline)}</strong></div>`
          : `<div class="small muted" style="margin-bottom:8px;">まだ判断材料がありません。</div>`
      }
      <div class="small" style="margin-bottom:8px;">
        ${observedSummary}
      </div>
      ${bars}
      ${confirmedNote}
      ${renderContributions(estimate)}
      ${(estimate.alternativeEstimates || [])
        .map(
          (alternative) => `
          <div class="card" style="margin-top:10px;margin-bottom:0;">
            <div class="fw-bold" style="margin-bottom:6px;">${escapeHtml(alternative.label)}</div>
            ${renderLikelihoodBars(alternative.settingLabels || estimate.settingLabels, alternative.likelihoods || [])}
            ${alternative.note ? `<div class="small muted" style="margin-top:6px;">${escapeHtml(alternative.note)}</div>` : ""}
          </div>`
        )
        .join("")}
      ${(estimate.warningMessages || [])
        .map((message) => `<div class="alert" style="margin-top:8px;">${escapeHtml(message)}</div>`)
        .join("")}
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
        estimate.excludedSettings?.length
          ? `<div class="small" style="margin-top:6px;">否定設定：${estimate.excludedSettings.map((setting) => `設定${setting}`).join("・")}</div>`
          : ""
      }
      ${
        estimate.referenceHintSources?.length
          ? `<div class="small muted" style="margin-top:6px;">${estimate.referenceHintSources.map(escapeHtml).join("<br>")}</div>`
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
  if (summary.byPeriod) {
    const hitRows = summary.hits
      .map((hit, index) => `<div class="small">ボーナス${index + 1}回目：<strong>${hit.period}周期目</strong>で当選</div>`)
      .join("");
    const stats = [3, 4]
      .map((period) => summary.byPeriod.find((row) => row.period === period))
      .filter(Boolean)
      .map(
        (row) =>
          `<div class="small">${row.period}周期目：到達${row.reachCount}回／当選${row.hitCount}回（${formatPercent(row.hitRate)}）</div>`
      )
      .join("");
    const ongoing = summary.ongoing.length
      ? `<div class="small muted">進行中：${summary.ongoing.length}周期通過</div>`
      : "";
    return `${hitRows}${ongoing}${stats}`;
  }
  const expectation = reference.PERIOD_AT_EXPECTATION_SETTING1 || [];
  const entryLabel = (e) =>
    e.via === "miko" ? "乙女アタック→AT" : e.display_game !== null && e.display_game !== undefined ? `${e.display_game}G` : "?G";
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

function renderKageSection(kageLog, summary) {
  if (kageLog.length === 0) return "";
  const rows = kageLog
    .map(
      (entry, index) => `
        <div class="small" style="display:flex;align-items:center;gap:8px;">
          <span>${index + 1}.</span>
          <strong>${entry.ura ? "裏景之ST" : "真景之ST"}</strong>
          <button type="button" class="btn btn-sm kage-del" data-index="${index}" style="margin-left:auto;">×</button>
        </div>`
    )
    .join("");
  return `${rows}<div class="small muted" style="margin-top:6px;">復讐の炎成功 ${summary.totalCount}回／裏 ${summary.uraCount}回（${formatPercent(summary.uraRate)}）</div>`;
}

function renderBinaryLogSection(definition, log, summary) {
  if (log.length === 0) return "";
  const rows = log
    .map(
      (entry, index) => `
        <div class="small" style="display:flex;align-items:center;gap:8px;">
          <span>${index + 1}.</span>
          <strong>${entry.win ? escapeHtml(definition.winLabel) : escapeHtml(definition.loseLabel)}</strong>
          <button type="button" class="btn btn-sm binary-log-del" data-log-key="${definition.key}" data-index="${index}" style="margin-left:auto;">×</button>
        </div>`
    )
    .join("");
  return `${rows}<div class="small muted" style="margin-top:6px;">${escapeHtml(definition.summaryLabel)}：${summary.totalCount}回中${summary.winCount}回（${formatPercent(summary.winRate)}）</div>`;
}

function renderMikoSection(mikoLog, summary) {
  if (mikoLog.length === 0) return "";
  const rows = mikoLog
    .map(
      (m, i) => `
        <div class="small" style="display:flex;align-items:center;gap:8px;">
          <span>${i + 1}.</span>
          <span>${m.total_game !== null && m.total_game !== undefined ? `${m.total_game}G` : "総G数なし"}</span>
          <strong>${!m.won ? "乙女アタック ハズレ" : m.at_won === false ? "乙女アタック当選→AT取れず" : "乙女アタック当選→AT当選"}</strong>
          ${m.kansuke ? '<span class="muted">（カンスケ中・判別から除外）</span>' : ""}
          <button type="button" class="btn btn-sm miko-del" data-index="${i}" style="margin-left:auto;">×</button>
        </div>`
    )
    .join("");
  const atStats =
    summary && summary.czWinTotal > 0
      ? `<div class="small" style="margin-top:6px;">乙女アタック当選${summary.czWinTotal}回のうちAT当選${summary.atWinCount}回</div>`
      : "";
  const stats =
    summary && summary.averageInterval
      ? `<div class="small muted" style="margin-top:6px;">平均${Math.round(summary.averageInterval)}G間隔で到達</div>`
      : "";
  return rows + atStats + stats;
}

/**
 * AT中ゲーム数：手入力があればそれ、無ければ「総ゲーム数−通常ゲーム数」を目安として使う
 * （ボーナス・CZ中のゲーム数も含むので、実際より少し多めになる）。
 */
function resolveAtGameCount(container) {
  const manual = container.querySelector("#f-at-game-count")?.value ?? "";
  if (manual !== "") return { value: Number(manual), estimated: false };
  const total = container.querySelector("#f-total-game-count").value;
  const normal = container.querySelector("#f-game-count").value;
  if (total === "" || normal === "") return { value: null, estimated: true };
  const diff = Number(total) - Number(normal);
  return { value: diff > 0 ? diff : null, estimated: true };
}

/** AT中CZメモ：本能寺の変・カシンバトルを1つのリストにまとめて表示し、その下に種類ごとの集計を出す。 */
function renderAtCzSection(reference, entries, summaries, atGame) {
  if (entries.length === 0) return "";
  const kindLabel = (key) => reference.AT_CZ_KINDS.find((k) => k.key === key)?.shortLabel ?? key;
  const triggerLabel = (value) => reference.AT_CZ_TRIGGERS.find((t) => t.value === value)?.label ?? value;
  const rows = entries
    .map(
      (e, i) => `
        <div class="small" style="display:flex;align-items:center;gap:8px;">
          <span>${i + 1}.</span>
          <span>${escapeHtml(kindLabel(e.kind))}</span>
          <span class="muted">${escapeHtml(triggerLabel(e.trigger))}</span>
          ${e.at_game !== null && e.at_game !== undefined ? `<span>AT${e.at_game}G</span>` : ""}
          <strong>${e.won ? "勝利" : "敗北"}</strong>
          <button type="button" class="btn btn-sm atcz-del" data-id="${e.id}" style="margin-left:auto;">×</button>
        </div>`
    )
    .join("");
  const stats = summaries
    .filter((s) => s.count > 0)
    .map((s) => {
      const byTrigger = s.byTrigger.map((t) => `${escapeHtml(t.label)} ${t.count}回中${t.wins}勝`).join("／");
      const entryLine =
        s.setting1EntryRate && atGame.value
          ? `<div class="small muted">突入率${atGame.estimated ? "（目安）" : ""}：${s.entryRate ? formatRateAsFraction(s.entryRate) : "-"}
               （AT中${atGame.value}G、設定1は${formatRateAsFraction(s.setting1EntryRate)}）</div>`
          : "";
      return `
        <div id="atcz-summary-${s.key}" style="margin-top:6px;">
          <div class="small"><strong>${escapeHtml(s.label)}</strong>：${s.count}回中${s.wins}勝（勝率${formatPercent(s.winRate)}、設定1は約${Math.round(s.setting1WinRate * 100)}%）</div>
          <div class="small muted">${byTrigger}</div>
          ${entryLine}
        </div>`;
    })
    .join("");
  return rows + stats;
}

function readForm(container, logs = null) {
  const val = (id) => container.querySelector(`#${id}`)?.value ?? "";
  return {
    ...(logs || {}),
    play_date: val("f-play-date"),
    machine_number: val("f-machine-number"),
    game_count: val("f-game-count"),
    total_game_count: val("f-total-game-count"),
    at_count: val("f-at-count"),
    bonus_direct_count: val("f-bonus-direct-count"),
    bonus_count: val("f-bonus-count"),
    st_count: val("f-st-count"),
    bell_count: val("f-bell-count"),
    cz_remi_count: val("f-cz-remi-count"),
    cz_rize_count: val("f-cz-rize-count"),
    episode_count: val("f-episode-count"),
    replay_direct_count: val("f-replay-direct-count"),
    lower_replay_count: val("f-lower-replay-count"),
    cz_count: val("f-cz-count"),
    direct_at_count: val("f-direct-at-count"),
    yagyu_count: val("f-yagyu-count"),
    miko_reach_count: val("f-miko-reach-count"),
    cz_win_count: val("f-cz-win-count"),
    max_ending_stamp: val("f-max-ending-stamp"),
    max_payout_over: val("f-max-payout-over"),
    ceiling_reset_hint: container.querySelector("#f-ceiling-reset-hint")?.checked ?? false,
    at_game_count: container.querySelector("#f-at-game-count")?.value ?? "",
    memo: val("f-memo"),
    actual_setting: val("f-actual-setting"),
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
    at_count:
      observation?.at_count ??
      (reference.MACHINE_KEY === "tokyo_ghoul" || reference.MACHINE_KEY === "shinuchi_yoshimune" ? "" : 0),
    bonus_direct_count: observation?.bonus_direct_count ?? "", // 空欄＝数えていない（推定に使わない）
    bonus_count: observation?.bonus_count ?? "",
    st_count: observation?.st_count ?? "",
    bell_count: observation?.bell_count ?? "",
    cz_remi_count: observation?.cz_remi_count ?? "",
    cz_rize_count: observation?.cz_rize_count ?? "",
    episode_count: observation?.episode_count ?? "",
    replay_direct_count: observation?.replay_direct_count ?? "",
    lower_replay_count: observation?.lower_replay_count ?? "",
    cz_count: observation?.cz_count ?? "",
    direct_at_count: observation?.direct_at_count ?? "",
    yagyu_count: observation?.yagyu_count ?? "",
    miko_reach_count: observation?.miko_reach_count ?? 0,
    cz_win_count: observation?.cz_win_count ?? 0,
    max_ending_stamp: observation?.max_ending_stamp ?? "none",
    max_payout_over: observation?.max_payout_over ?? "none",
    ceiling_reset_hint: observation?.ceiling_reset_hint ?? false,
    period_log: observation?.period_log ?? [],
    miko_log: observation?.miko_log ?? [],
    hint_flags: observation?.hint_flags ?? [],
    strap_counts: observation?.strap_counts ?? {},
    at_game_count: observation?.at_game_count ?? "", // 空欄＝総ゲーム数−通常ゲーム数の目安を使う
    actual_setting: observation?.actual_setting ?? "",
    at_cz_log: observation?.at_cz_log ?? [],
    kage_log: observation?.kage_log ?? [],
    cz100_log: observation?.cz100_log ?? [],
    pullback_log: observation?.pullback_log ?? [],
    batto_log: observation?.batto_log ?? [],
    dwin_rows: observation?.dwin_rows ?? [],
    memo: observation?.memo ?? "",
  };
  // 周期メモ・巫女ポイント0メモ・示唆チェック・ストラップ回数は画面上で追記していくので、手元に持つ。
  const logs = {
    period_log: [...(values.period_log || [])],
    miko_log: [...(values.miko_log || [])],
    hint_flags: [...(values.hint_flags || [])],
    strap_counts: { ...(values.strap_counts || {}) },
    at_cz_log: [...(values.at_cz_log || [])],
    kage_log: [...(values.kage_log || [])],
    cz100_log: [...(values.cz100_log || [])],
    pullback_log: [...(values.pullback_log || [])],
    batto_log: [...(values.batto_log || [])],
    dwin_rows: [...(values.dwin_rows || [])],
  };
  const isOtome = reference.MACHINE_KEY === "sengoku_otome5";
  const isKabaneri = reference.MACHINE_KEY === "kabaneri2_unato";
  const isTokyoGhoul = reference.MACHINE_KEY === "tokyo_ghoul";
  const isShinuchiYoshimune = reference.MACHINE_KEY === "shinuchi_yoshimune";
  const supportsDwin = isOtome;
  const hasPeriodLog =
    typeof reference.summarizePeriodLog === "function" || typeof reference.summarizePeriodStats === "function";
  const hasMikoLog = typeof reference.summarizeMikoLog === "function";
  const hasKageLog = typeof reference.summarizeKageLog === "function";
  const binaryLogs = reference.BINARY_LOGS || [];
  const hasCeilingResetHint = "SETTING_CHANGE_CEILING_GAMES" in reference;
  const atCzKinds = reference.AT_CZ_KINDS || [];
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
      ${supportsDwin ? `<div class="card" id="dwin-card">
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
      </div>` : ""}
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
        <div class="hint">${
          isKabaneri
            ? "初当たり・ST・下段ベルの分母は未確認です。暫定的に通常ゲーム数を使います（要検証）。"
            : isTokyoGhoul
              ? "各確率の分母は未確認です。暫定的に通常ゲーム数を使います（要検証）。"
              : isShinuchiYoshimune
                ? "マイスロ中断データの『通常プレイ数』（CZ込みではない方）。解析値の分母定義は未確認のため要検証です。"
                : "AT・ボーナス消化中を除いた、通常時のゲーム数。AT初当たり確率の分母はこちらを使います。"
        }</div>
      </div>
      <div class="field">
        <label>総ゲーム数（任意）</label>
        <input type="number" id="f-total-game-count" min="0" inputmode="numeric" placeholder="AT消化分も含めた合計。任意" value="${values.total_game_count ?? ""}">
        <div class="hint">AT・ボーナス消化分も含めた、その日実際に回したゲーム数。記録用の参考値で、推定計算には使いません。</div>
      </div>
      ${isOtome ? `<div class="field">
        <label>AT当選回数（初当たり合計）</label>
        <input type="number" id="f-at-count" min="0" inputmode="numeric" value="${values.at_count}">
        <div class="hint" id="at-count-hint">戦国乙女ボーナス直撃・CZ勝利、どちらでのAT当選も合わせた回数。</div>
      </div>
      <div class="field">
        <label>うち戦国乙女ボーナス直撃回数</label>
        <input type="number" id="f-bonus-direct-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.bonus_direct_count ?? ""}">
        <div class="hint">設定1:1/21206.7〜設定6:1/5502.7と設定差が大きい要素。数えた日は0回でも「0」を入れると推定に反映されます（空欄なら使いません）。</div>
      </div>` : isKabaneri ? `
      <div class="field">
        <label>ボーナス初当たり回数（任意）</label>
        <input type="number" id="f-bonus-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.bonus_count ?? ""}">
      </div>
      <div class="field">
        <label>ST突入（初当たり）回数（任意）</label>
        <input type="number" id="f-st-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.st_count ?? ""}">
      </div>
      <div class="field">
        <label>下段ベル回数（任意）</label>
        <input type="number" id="f-bell-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.bell_count ?? ""}">
      </div>` : isTokyoGhoul ? `
      <div class="field">
        <label>AT初当たり回数（任意）</label>
        <input type="number" id="f-at-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.at_count ?? ""}">
      </div>
      <div class="field">
        <label>CZ「レミニセンス」回数（任意）</label>
        <input type="number" id="f-cz-remi-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.cz_remi_count ?? ""}">
      </div>
      <div class="field">
        <label>上位CZ「大喰いの利世」回数（任意）</label>
        <input type="number" id="f-cz-rize-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.cz_rize_count ?? ""}">
      </div>
      <div class="field">
        <label>エピソードボーナス回数（任意）</label>
        <input type="number" id="f-episode-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.episode_count ?? ""}">
      </div>
      <div class="field">
        <label>リプレイからのAT直撃回数（任意）</label>
        <input type="number" id="f-replay-direct-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.replay_direct_count ?? ""}">
      </div>
      <div class="field">
        <label>下段リプレイ回数（任意）</label>
        <input type="number" id="f-lower-replay-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.lower_replay_count ?? ""}">
      </div>` : isShinuchiYoshimune ? `
      <div class="field">
        <label>AT初当たり回数（任意）</label>
        <input type="number" id="f-at-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.at_count ?? ""}">
        <div class="hint">マイスロ中断データの「初当り回数」。CZ成功と直撃ATの合計です。</div>
      </div>
      <div class="field">
        <label>CZ（悪人成敗チャンス）総回数（任意）</label>
        <input type="number" id="f-cz-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.cz_count ?? ""}">
        <div class="hint">マイスロ中断データの「悪人成敗チャンス全体」の成功数ではなく<strong>総回数</strong>を入力。直撃ATは含めません。</div>
      </div>
      <div class="field">
        <label>直撃AT回数（任意）</label>
        <input type="number" id="f-direct-at-count" min="0" inputmode="numeric" placeholder="未入力なら直撃込み推定を表示しない" value="${values.direct_at_count ?? ""}">
        <div class="hint">マイスロ中断データでは「初当り回数 − 悪人成敗チャンスの成功数」で確認できます。自動計算はしません。</div>
      </div>
      <div class="field">
        <label>CZで柳生だった回数（任意）</label>
        <input type="number" id="f-yagyu-count" min="0" inputmode="numeric" placeholder="数えていなければ空欄" value="${values.yagyu_count ?? ""}">
        <div class="hint">マイスロ中断データの「悪人成敗チャンス 柳生」の成功数ではなく<strong>総回数</strong>を入力。CZ総回数以下にしてください。</div>
      </div>` : ""}
      ${hasPeriodLog ? `<div class="card" id="period-card">
        <h2 style="margin-top:0;">周期メモ <span class="small muted" id="period-current"></span></h2>
        <div class="field" style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:6em;">
            <label>液晶の表示G数</label>
            <input type="number" id="f-period-game" min="0" inputmode="numeric" placeholder="例: 100">
          </div>
          <button type="button" class="btn" id="period-miss-btn">ハズレ</button>
          <button type="button" class="btn btn-primary" id="period-hit-btn">${isKabaneri ? "ボーナス当選" : "AT当選"}</button>
        </div>
        <div id="period-log"></div>
        <button type="button" class="btn btn-sm" id="period-undo-btn" style="margin-top:6px;">最後の1件を取消</button>
      </div>` : ""}

      ${hasMikoLog ? `<div class="card" id="miko-card">
        <h2 style="margin-top:0;">巫女ポイント0メモ</h2>
        <div class="field" style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:7em;">
            <label>その時の総G数</label>
            <input type="number" id="f-miko-total-game" min="0" inputmode="numeric" placeholder="例: 1234">
          </div>
          <label class="small" style="display:flex;align-items:center;gap:4px;">
            <input type="checkbox" id="f-miko-kansuke">カンスケ中
          </label>
        </div>
        <div class="field" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="btn" id="miko-lose-btn">乙女アタック ハズレ</button>
          <button type="button" class="btn" id="miko-cz-only-btn">乙女アタック当選→AT取れず</button>
          <button type="button" class="btn btn-primary" id="miko-win-btn">乙女アタック当選→AT当選</button>
        </div>
        <div class="hint small muted">AT当選まで行った時だけ、周期メモが1周期目からに戻ります（乙女アタックに当選してもATを取れなければ周期はそのまま）。
          乙女アタック当選率の解析値はカンスケ滞在時を除いた数値のため、カンスケ中の分は判別から外します。</div>
        <div id="miko-log"></div>
      </div>` : ""}

      ${hasKageLog ? `<div class="card" id="kage-card">
        <h2 style="margin-top:0;">景之STメモ</h2>
        <div class="hint small muted">復讐の炎に成功したたびに、移行先を記録します。真景之STと裏景之STの合計が突入率の母数です。</div>
        <div class="field" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="btn kage-btn" data-ura="0">真景之ST</button>
          <button type="button" class="btn btn-primary kage-btn" data-ura="1">裏景之ST</button>
        </div>
        <div id="kage-log"></div>
      </div>` : ""}

      ${binaryLogs
        .map(
          (definition) => `<div class="card" id="${definition.idPrefix}-card">
        <h2 style="margin-top:0;">${escapeHtml(definition.title)}</h2>
        <div class="hint small muted">${escapeHtml(definition.description)}</div>
        <div class="field" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="btn binary-log-btn" data-log-key="${definition.key}" data-win="0">${escapeHtml(definition.loseLabel)}</button>
          <button type="button" class="btn btn-primary binary-log-btn" data-log-key="${definition.key}" data-win="1">${escapeHtml(definition.winLabel)}</button>
        </div>
        <div id="${definition.idPrefix}-log"></div>
      </div>`
        )
        .join("")}

      ${
        atCzKinds.length
          ? `<div class="card" id="atcz-card">
        <h2 style="margin-top:0;">AT中のCZメモ</h2>
        <div class="hint small muted">記録用です。設定1以外の数値が公開されていないので推定には使わず、設定1と並べて表示するだけです。</div>
        <div class="field">
          <label>AT中ゲーム数（任意）</label>
          <input type="number" id="f-at-game-count" min="0" inputmode="numeric" placeholder="空欄なら総ゲーム数−通常ゲーム数を目安に使う" value="${values.at_game_count ?? ""}">
          <div class="hint">空欄の場合は「総ゲーム数−通常ゲーム数」（打-WINから読み込んだ値など）を目安に使います。ボーナス・CZ中も含むので実際より少し多めです。</div>
        </div>
        <div class="field" style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;">
          <div style="min-width:7em;">
            <label class="small">契機</label>
            <select id="f-atcz-trigger">${(reference.AT_CZ_TRIGGERS || [])
              .map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`)
              .join("")}</select>
          </div>
          <div style="flex:1;min-width:6em;">
            <label class="small">その時のAT中G数（任意）</label>
            <input type="number" id="f-atcz-game" min="0" inputmode="numeric" placeholder="例: 70">
          </div>
        </div>
        ${atCzKinds
          .map(
            (kind) => `
          <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
            <div style="flex:1;">${escapeHtml(kind.label)}</div>
            <button type="button" class="btn atcz-btn" data-kind="${kind.key}" data-won="0">${escapeHtml(kind.shortLabel)} 敗北</button>
            <button type="button" class="btn btn-primary atcz-btn" data-kind="${kind.key}" data-won="1">${escapeHtml(kind.shortLabel)} 勝利</button>
          </div>`
          )
          .join("")}
        <div id="atcz-log" style="margin-top:8px;"></div>
      </div>`
          : ""
      }

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
          ${reference.SETTING_HINT_GROUP_NOTES?.[group] ? `<div class="hint small muted">${escapeHtml(reference.SETTING_HINT_GROUP_NOTES[group])}</div>` : ""}
          ${settingHints
            .filter((h) => h.group === group)
            .map(
              (h) => `
            <label class="small" style="display:flex;align-items:center;gap:6px;margin:2px 0;">
              <input type="checkbox" class="hint-flag" value="${h.value}" ${logs.hint_flags.includes(h.value) ? "checked" : ""}>
              ${escapeHtml(h.label)}
              <span class="muted">${
                h.minSetting
                  ? `（設定${h.minSetting}${h.minSetting === 6 ? "" : "以上"}濃厚）`
                  : h.excludes?.length
                    ? `（設定${h.excludes.join("・")}否定）`
                    : h.note
                      ? `（${escapeHtml(h.note)}）`
                      : h.parity === "odd"
                        ? "（奇数示唆）"
                        : "（偶数示唆）"
              }</span>
            </label>`
            )
            .join("")}`
          )
          .join("")}
      </div>`
          : ""
      }
      <div id="autosave-status" class="small muted"></div>

      ${hasMikoLog ? `<div class="field">
        <label>巫女ポイント0到達回数</label>
        <input type="number" id="f-miko-reach-count" min="0" inputmode="numeric" value="${values.miko_reach_count}">
      </div>
      <div class="field">
        <label>うちCZ（乙女アタック）当選回数</label>
        <input type="number" id="f-cz-win-count" min="0" inputmode="numeric" value="${values.cz_win_count}">
      </div>` : ""}
      ${reference.ENDING_STAMPS.length ? `<div class="field">
        <label>${escapeHtml(reference.ENDING_STAMP_FIELD_LABEL || (isKabaneri ? "ST終了画面、その日一番高かったもの" : "ボーナス終了画面スタンプ、その日一番高かったもの"))}</label>
        <select id="f-max-ending-stamp">${stampOptions}</select>
      </div>` : ""}
      ${reference.PAYOUT_OVER_HINTS.length ? `<div class="field">
        <label>終了画面の獲得枚数表示、その日一番高かったもの</label>
        <select id="f-max-payout-over">${payoutOptions}</select>
      </div>` : ""}
      ${hasCeilingResetHint ? `<div class="field">
        <label class="small" style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="f-ceiling-reset-hint" ${values.ceiling_reset_hint ? "checked" : ""}>
          短縮天井（650G／4周期以内）で強制AT当選するのを見た
        </label>
        <div class="hint">通常の天井は999G・6周期ですが、設定変更があった日はここまで短縮されるとされています。
          設定の高低ではなく「今日、設定が変更された（据え置きではない）」ことの示唆です。</div>
      </div>` : ""}
      <div class="field">
        <label>実際の設定（判明したら。任意）</label>
        <select id="f-actual-setting">
          <option value="">不明</option>
          ${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${String(values.actual_setting) === String(n) ? "selected" : ""}>設定${n}</option>`).join("")}
        </select>
        <div class="hint">推定の答え合わせ用です（計算には使いません）。後から入力・変更できます。</div>
      </div>
      <div class="field">
        <label>メモ</label>
        <textarea id="f-memo" rows="2">${escapeHtml(values.memo)}</textarea>
      </div>

      <div id="estimate-panel"></div>

      <div class="card" id="anonymous-export-card">
        <div class="fw-bold">匿名で書き出す</div>
        <div class="small muted">含む：${escapeHtml(EXPORT_DESCRIPTION.included)}<br>含まない：${escapeHtml(EXPORT_DESCRIPTION.excluded)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
          <button type="button" class="btn btn-sm" id="anon-export-file-btn">ファイルに書き出す</button>
          <button type="button" class="btn btn-sm" id="anon-export-copy-btn">コピーする</button>
        </div>
        <div class="small muted" id="anon-export-status"></div>
      </div>

      <button type="submit" class="btn btn-primary">保存</button>
      <a class="btn" href="${buildUrl("/setting-tool", { shop_id: shopId, machine_id: machineId })}">戻る</a>
      ${isEdit ? '<button type="button" class="btn btn-danger" id="delete-btn" style="float:right;">削除</button>' : ""}
    </form>
  `;

  const $ = (id) => container.querySelector(`#${id}`);
  const estimatePanel = $("estimate-panel");

  function updateEstimate() {
    const current = readForm(container, logs);
    keepScrollPosition(() => {
      try {
        const estimate = buildEstimateWithHints(reference, current);
        estimatePanel.innerHTML = renderEstimatePanel(reference, estimate);
      } catch (err) {
        estimatePanel.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
      }
    });
  }

  /** 周期メモ・巫女メモの表示を描き直し、巫女メモがあれば回数欄をメモからの集計値で上書き（読み取り専用）する。 */
  function refreshLogs() {
    keepScrollPosition(refreshLogsBody);
  }

  /**
   * 戦国乙女5：周期メモに1件でも記録があれば、AT当選回数を周期メモの「AT当選」の件数に合わせる（読み取り専用）。
   * 巫女ポイント0でAT当選した分は、周期メモ側にも自動で区切りが入るので重複しない。
   * 周期メモの無い使い方（手入力だけ）のときは、従来どおり手入力できる。
   */
  function syncAtCountFromPeriodLog() {
    const atCountInput = $("f-at-count");
    if (!isOtome || !atCountInput) return;
    const useLog = logs.period_log.length > 0;
    if (useLog) atCountInput.value = logs.period_log.filter((entry) => entry.hit).length;
    atCountInput.readOnly = useLog;
    const hint = $("at-count-hint");
    if (hint) {
      hint.textContent = useLog
        ? "周期メモの「AT当選」の件数を自動で入れています（直撃など周期メモに無いAT当選は、周期メモに「AT当選」として足してください）。"
        : "戦国乙女ボーナス直撃・CZ勝利、どちらでのAT当選も合わせた回数。周期メモを使うと自動で入ります。";
    }
  }

  function refreshLogsBody() {
    if (hasPeriodLog) {
      const summarizePeriod = reference.summarizePeriodLog || reference.summarizePeriodStats;
      const periodSummary = summarizePeriod(logs.period_log);
      $("period-current").textContent = `（次は${periodSummary.currentPeriod}周期目）`;
      $("period-log").innerHTML = renderPeriodSection(reference, periodSummary);
      $("period-undo-btn").style.display = logs.period_log.length ? "" : "none";
      syncAtCountFromPeriodLog();
    }

    if (hasMikoLog) {
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
          // AT当選の削除は、周期メモ側に自動で入れた区切りエントリも一緒に取り消す。
          if (removed && removed.id !== null && removed.id !== undefined) {
            const linkedIndex = logs.period_log.findIndex((p) => p.linked_miko_id === removed.id);
            if (linkedIndex !== -1) logs.period_log.splice(linkedIndex, 1);
          }
          await onLogChanged();
        })
      );
    }

    if (hasKageLog) {
      const kageSummary = reference.summarizeKageLog(logs.kage_log);
      $("kage-log").innerHTML = renderKageSection(logs.kage_log, kageSummary);
      container.querySelectorAll(".kage-del").forEach((btn) =>
        btn.addEventListener("click", async () => {
          logs.kage_log.splice(Number(btn.dataset.index), 1);
          await onLogChanged();
        })
      );
    }

    for (const definition of binaryLogs) {
      const log = logs[definition.key];
      const summary = reference.summarizeResultLog(log);
      $(`${definition.idPrefix}-log`).innerHTML = renderBinaryLogSection(definition, log, summary);
      $(`${definition.idPrefix}-log`).querySelectorAll(".binary-log-del").forEach((btn) =>
        btn.addEventListener("click", async () => {
          logs[btn.dataset.logKey].splice(Number(btn.dataset.index), 1);
          await onLogChanged();
        })
      );
    }
    refreshAtCz();
    updateEstimate();
  }

  /** AT中CZメモ（本能寺の変・カシンバトル）の表示を描き直す。 */
  function refreshAtCz() {
    if (!atCzKinds.length) return;
    const atGame = resolveAtGameCount(container);
    const summaries = reference.summarizeAtCzLog(logs.at_cz_log, { atGameCount: atGame.value });
    $("atcz-log").innerHTML = renderAtCzSection(reference, logs.at_cz_log, summaries, atGame);
    container.querySelectorAll(".atcz-del").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const index = logs.at_cz_log.findIndex((e) => String(e.id) === btn.dataset.id);
        if (index !== -1) logs.at_cz_log.splice(index, 1);
        await onLogChanged();
      })
    );
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
  if (hasPeriodLog) {
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
  }

  // 巫女ポイント0 → 乙女アタック当否（won） → AT当否（atWon）。
  async function addMiko(won, atWon = false) {
    const raw = $("f-miko-total-game").value;
    const entry = {
      id: Date.now(),
      total_game: raw === "" ? null : Number(raw),
      won,
      at_won: won && atWon,
      kansuke: $("f-miko-kansuke").checked,
    };
    logs.miko_log.push(entry);
    if (entry.at_won) {
      // AT当選は初当たり。次の周期は1周期目から数え直しになるので、周期メモ側にも区切りを入れる。
      // 乙女アタックに当選してもATを取れなかった場合は周期が続くので、区切りは入れない。
      logs.period_log.push({ display_game: null, hit: true, via: "miko", linked_miko_id: entry.id });
    }
    $("f-miko-total-game").value = "";
    $("f-miko-kansuke").checked = false;
    await onLogChanged();
  }
  if (hasMikoLog) {
    $("miko-win-btn").addEventListener("click", () => addMiko(true, true));
    $("miko-cz-only-btn").addEventListener("click", () => addMiko(true, false));
    $("miko-lose-btn").addEventListener("click", () => addMiko(false));
  }

  container.querySelectorAll(".kage-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      logs.kage_log.push({ id: Date.now(), ura: btn.dataset.ura === "1" });
      await onLogChanged();
    })
  );

  container.querySelectorAll(".binary-log-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      logs[btn.dataset.logKey].push({ id: Date.now(), win: btn.dataset.win === "1" });
      await onLogChanged();
    })
  );

  // AT中CZメモ：契機を選んで勝利/敗北を押すたびに1件追加して自動保存。
  container.querySelectorAll(".atcz-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const raw = $("f-atcz-game").value;
      logs.at_cz_log.push({
        id: Date.now(),
        kind: btn.dataset.kind,
        trigger: $("f-atcz-trigger").value,
        at_game: raw === "" ? null : Number(raw),
        won: btn.dataset.won === "1",
      });
      $("f-atcz-game").value = "";
      await onLogChanged();
    })
  );
  if ($("f-at-game-count")) {
    // 打-WIN読み込み時はchangeイベントで通知されるので、inputとchangeの両方で描き直す。
    ["f-at-game-count", "f-game-count", "f-total-game-count"].forEach((id) => {
      $(id).addEventListener("input", refreshAtCz);
      $(id).addEventListener("change", refreshAtCz);
    });
    // 手入力のAT中ゲーム数は確定時に自動保存（遊技中に閉じても残るように）。
    $("f-at-game-count").addEventListener("change", async () => {
      refreshAtCz();
      await autoSave();
    });
  }

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
  // 打-WINから読み込む：総ゲーム数・通常ゲーム数・終了画面スタンプだけ自動反映し、
  // それ以外は「参考データ」として一覧表示するだけ（用語の意味が完全一致するか未確認なため）。
  // 将来マイスロのQR内容が確認できた場合も、この関数へ正規化済みデータを渡してフォームを埋める。
  function applyImportedFormValues(data) {
    const filled = [];
    if (data.normalGameCount !== null) {
      $("f-game-count").value = data.normalGameCount;
      filled.push("通常ゲーム数");
    }
    if (data.totalGameCount !== null) {
      $("f-total-game-count").value = data.totalGameCount;
      filled.push("総ゲーム数");
    }
    if (data.maxEndingStamp && $("f-max-ending-stamp")) {
      $("f-max-ending-stamp").value = data.maxEndingStamp;
      filled.push("終了画面スタンプ");
    }
    // AT中ゲーム数：手で入れた値があればそれを優先し、空欄のときだけ打-WINの分母から逆算した値を入れる。
    if (data.atGameCountDerived && $("f-at-game-count")) {
      if ($("f-at-game-count").value === "") {
        $("f-at-game-count").value = data.atGameCountDerived.value;
        filled.push(`AT中ゲーム数（${data.atGameCountDerived.scopeLabel}・打-WINの確率から逆算）`);
      }
    }
    ["f-game-count", "f-total-game-count", "f-max-ending-stamp", "f-at-game-count"].forEach((id) => {
      if ($(id)) $(id).dispatchEvent(new Event("change", { bubbles: true }));
    });
    return filled;
  }

  /** 打-WINの参考データ（読み込んだもの・保存済みのもの）を画面に出す。 */
  function renderDwinReference(rows, caption) {
    const refBox = $("dwin-reference");
    if (!refBox) return;
    refBox.innerHTML = rows.length
      ? `
          <div class="small muted" style="margin-top:6px;">${escapeHtml(caption)}</div>
          <div class="small">${rows.map((r) => `${escapeHtml(r.label)}：${escapeHtml(r.value)}`).join("<br>")}</div>
        `
      : "";
  }
  if (logs.dwin_rows.length) {
    renderDwinReference(logs.dwin_rows, "保存済みの打-WINデータ（推定には使いません。設定が分かったときの見比べ用）：");
  }

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
      const filled = applyImportedFormValues(data);
      status.textContent = filled.length
        ? `反映しました：${filled.join("・")}`
        : "読み込みましたが、反映できる項目が見つかりませんでした。";
      if (data.referenceRows.length) {
        logs.dwin_rows = data.referenceRows.map((r) => ({ label: r.label, value: r.value }));
        renderDwinReference(
          logs.dwin_rows,
          "参考データ（推定には使いません。保存すると、設定が分かったときの見比べ用に残ります）："
        );
      }
    } catch (err) {
      status.textContent = `読み込めませんでした：${err.message}`;
    }
  }
  if (supportsDwin) {
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
  }

  [
    "f-game-count",
    "f-total-game-count",
    "f-at-count",
    "f-bonus-direct-count",
    "f-bonus-count",
    "f-st-count",
    "f-bell-count",
    "f-cz-remi-count",
    "f-cz-rize-count",
    "f-episode-count",
    "f-replay-direct-count",
    "f-lower-replay-count",
    "f-cz-count",
    "f-direct-at-count",
    "f-yagyu-count",
    "f-miko-reach-count",
    "f-cz-win-count",
    "f-max-ending-stamp",
    "f-max-payout-over",
    "f-ceiling-reset-hint",
  ].forEach((id) => {
    if (!$(id)) return;
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

  function buildAnonymousExportJson() {
    const current = readForm(container, logs);
    let estimate = null;
    try {
      estimate = buildEstimateWithHints(reference, current);
    } catch {
      estimate = null;
    }
    const exported = buildAnonymousObservationExport(current, reference, estimate);
    return { exported, json: JSON.stringify(exported, null, 2) };
  }

  $("anon-export-file-btn").addEventListener("click", () => {
    const { exported, json } = buildAnonymousExportJson();
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = buildAnonymousExportFilename(exported);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    $("anon-export-status").textContent = `書き出しました：${a.download}`;
  });

  $("anon-export-copy-btn").addEventListener("click", async () => {
    const { json } = buildAnonymousExportJson();
    try {
      await navigator.clipboard.writeText(json);
      $("anon-export-status").textContent = "コピーしました。そのまま貼り付けてください。";
    } catch {
      $("anon-export-status").textContent = "コピーできませんでした。「ファイルに書き出す」を使ってください。";
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
