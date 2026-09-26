/**
 * 店舗の新規登録・編集フォーム。Flask版 templates/shops/form.html 相当。
 */
import {
  getShop,
  createShop,
  updateShop,
  archiveShop,
  unarchiveShop,
  deleteShop,
  shopHasHistory,
  ValidationError,
} from "../repository.js";
import { escapeHtml } from "../ui/format.js";
import { setFlash } from "../ui/flash.js";
import { buildUrl, navigate } from "../router.js";

const RATE_REFERENCE = [
  { count: "46枚", rate: 21.74 },
  { count: "47枚", rate: 21.28 },
  { count: "48枚", rate: 20.83 },
  { count: "50枚（等価）", rate: 20.0 },
  { count: "51.52枚", rate: 19.41 },
  { count: "52.5枚", rate: 19.05 },
  { count: "55枚", rate: 18.18 },
  { count: "57枚", rate: 17.54 },
];

function readForm(container) {
  const val = (id) => container.querySelector(`#${id}`).value;
  return {
    name: val("f-name"),
    exchange_rate: val("f-exchange-rate"),
    lending_rate: val("f-lending-rate"),
    address: val("f-address"),
    memo: val("f-memo"),
  };
}

export async function renderShopForm(container, db, { shopId = null, errorMessage = null, formOverride = null } = {}) {
  const isEdit = shopId !== null;
  let shop = null;
  let hasHistory = false;
  if (isEdit) {
    shop = await getShop(db, shopId);
    if (!shop) {
      setFlash("店舗が見つかりませんでした（削除済みの可能性があります）。");
      navigate("/shops");
      return;
    }
    hasHistory = await shopHasHistory(db, shopId);
  }

  const values = formOverride || {
    name: shop?.name ?? "",
    exchange_rate: shop?.exchange_rate ?? "20.0",
    lending_rate: shop?.lending_rate ?? "20.0",
    address: shop?.address ?? "",
    memo: shop?.memo ?? "",
  };

  container.innerHTML = `
    ${errorMessage ? `<div class="alert alert-danger">${escapeHtml(errorMessage)}</div>` : ""}
    <h1>店舗${isEdit ? "編集" : "新規登録"}</h1>
    <form id="shop-form">
      <div class="field">
        <label>店舗名</label>
        <input type="text" id="f-name" required value="${escapeHtml(values.name)}">
      </div>
      <div class="field">
        <label>換金レート（円／枚）</label>
        <input type="number" step="0.01" id="f-exchange-rate" required value="${values.exchange_rate}">
        <div class="input-group mt-2">
          <span class="muted small" style="align-self:center;">1000円で</span>
          <input type="number" step="0.01" id="exchange-rate-count" placeholder="枚数">
          <span class="muted small" style="align-self:center;">枚</span>
          <button type="button" class="btn btn-sm" data-target="f-exchange-rate" data-count="exchange-rate-count">反映</button>
        </div>
      </div>
      <div class="field">
        <label>貸し出しレート（円／枚・参考指標）</label>
        <input type="number" step="0.01" id="f-lending-rate" required value="${values.lending_rate}">
        <div class="input-group mt-2">
          <span class="muted small" style="align-self:center;">1000円で</span>
          <input type="number" step="0.01" id="lending-rate-count" placeholder="枚数">
          <span class="muted small" style="align-self:center;">枚</span>
          <button type="button" class="btn btn-sm" data-target="f-lending-rate" data-count="lending-rate-count">反映</button>
        </div>
        <div class="hint">等価店は換金レートと同じ値でよい。収支計算には使わず参考表示のみに使う。</div>
      </div>

      <div class="card">
        <div class="small fw-bold mb-2">よくあるレート早見表（1000円あたりの枚数 → 円/枚）</div>
        <table class="simple" id="rate-reference-table">
          <thead><tr><th>1000円で</th><th>円／枚</th></tr></thead>
          <tbody>
            ${RATE_REFERENCE.map((r) => `<tr data-rate="${r.rate}" style="cursor:pointer;"><td>${r.count}</td><td>${r.rate.toFixed(2)}円</td></tr>`).join("")}
          </tbody>
        </table>
        <div class="hint mt-2">行をタップすると、直前にカーソルがあったレート欄に自動で入力されます。</div>
      </div>

      <div class="field">
        <label>住所</label>
        <input type="text" id="f-address" value="${escapeHtml(values.address)}">
      </div>
      <div class="field">
        <label>メモ</label>
        <textarea id="f-memo" rows="3">${escapeHtml(values.memo)}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">保存</button>
      <a class="btn" href="${buildUrl("/shops")}">戻る</a>
    </form>
    ${
      isEdit
        ? `<div class="mt-3" style="display:flex;gap:8px;flex-wrap:wrap;">
            ${
              shop.is_archived
                ? `<button type="button" class="btn" id="unarchive-btn">一覧に戻す</button>`
                : `<button type="button" class="btn" id="archive-btn">アーカイブする</button>`
            }
            ${
              !hasHistory
                ? `<button type="button" class="btn btn-danger" id="delete-btn">削除</button>`
                : `<span class="small muted" style="align-self:center;">記録・貯玉履歴があるため削除できません（アーカイブは可能です）。</span>`
            }
          </div>`
        : ""
    }
  `;

  const exchangeInput = container.querySelector("#f-exchange-rate");
  const lendingInput = container.querySelector("#f-lending-rate");
  let lastFocused = exchangeInput;
  [exchangeInput, lendingInput].forEach((input) => {
    input.addEventListener("focus", () => {
      lastFocused = input;
    });
  });

  container.querySelectorAll("[data-target][data-count]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const countInput = container.querySelector(`#${btn.dataset.count}`);
      const targetInput = container.querySelector(`#${btn.dataset.target}`);
      const count = parseFloat(countInput.value);
      if (!count || count <= 0) return;
      targetInput.value = Math.round((1000 / count) * 100) / 100;
    });
  });

  container.querySelectorAll("#rate-reference-table tbody tr").forEach((row) => {
    row.addEventListener("click", () => {
      lastFocused.value = row.dataset.rate;
      lastFocused.focus();
    });
  });

  container.querySelector("#shop-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = readForm(container);
    try {
      if (isEdit) {
        await updateShop(db, shopId, form);
        setFlash("店舗情報を更新しました。");
      } else {
        await createShop(db, form);
        setFlash("店舗を登録しました。");
      }
      navigate("/shops");
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderShopForm(container, db, { shopId, errorMessage: err.message, formOverride: form });
      } else {
        throw err;
      }
    }
  });

  if (isEdit) {
    const archiveBtn = container.querySelector("#archive-btn");
    if (archiveBtn) {
      archiveBtn.addEventListener("click", async () => {
        if (!window.confirm("アーカイブすると一覧や記録入力の選択肢に出なくなります。記録・貯玉履歴は残ります。よろしいですか？")) return;
        await archiveShop(db, shopId);
        setFlash("店舗をアーカイブしました。一覧や記録入力の選択肢には出なくなりますが、記録・貯玉履歴はそのまま残ります。");
        navigate("/shops");
      });
    }
    const unarchiveBtn = container.querySelector("#unarchive-btn");
    if (unarchiveBtn) {
      unarchiveBtn.addEventListener("click", async () => {
        await unarchiveShop(db, shopId);
        setFlash("店舗を一覧に戻しました。");
        navigate("/shops");
      });
    }
    const deleteBtn = container.querySelector("#delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm("この店舗を削除しますか？（記録・貯玉履歴がないため復元はできません）")) return;
        try {
          await deleteShop(db, shopId);
          setFlash("店舗を削除しました。");
          navigate("/shops");
        } catch (err) {
          await renderShopForm(container, db, { shopId, errorMessage: err.message });
        }
      });
    }
  }
}
