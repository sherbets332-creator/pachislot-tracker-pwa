/**
 * 貯玉換金・残高調整の新規登録・編集フォーム。
 * Flask版 templates/shops/{cashout_form,adjust_form}.html 相当（1ファイルに統合）。
 */
import {
  getShop,
  getShopBalance,
  createCashout,
  createAdjust,
  updateTransaction,
  deleteTransaction,
  ValidationError,
} from "../repository.js";
import { getById, STORE_NAMES } from "../db.js";
import { escapeHtml, commas } from "../ui/format.js";
import { setFlash } from "../ui/flash.js";
import { buildUrl, navigate } from "../router.js";

function readCashoutForm(container) {
  const val = (id) => container.querySelector(`#${id}`).value;
  return { transaction_date: val("f-date"), ball_count: val("f-ball-count"), cash_amount: val("f-cash-amount"), memo: val("f-memo") };
}
function readAdjustForm(container) {
  const val = (id) => container.querySelector(`#${id}`).value;
  return { transaction_date: val("f-date"), ball_count: val("f-ball-count"), memo: val("f-memo") };
}

export async function renderTransactionForm(
  container,
  db,
  { shopId, txId = null, type = null, errorMessage = null, formOverride = null } = {}
) {
  const shop = await getShop(db, shopId);
  if (!shop) {
    setFlash("店舗が見つかりませんでした（削除済みの可能性があります）。");
    navigate("/shops");
    return;
  }

  let tx = null;
  if (txId !== null) {
    tx = await getById(db, STORE_NAMES.SAVED_BALL_TRANSACTIONS, txId);
    if (!tx || tx.shop_id !== shopId || !["cashout", "adjust"].includes(tx.transaction_type)) {
      setFlash("編集できない履歴です。");
      navigate(`/shops/${shopId}`);
      return;
    }
    type = tx.transaction_type;
  }
  const isEdit = tx !== null;
  const isCashout = type === "cashout";
  const balance = await getShopBalance(db, shopId);

  const values = formOverride || {
    transaction_date: tx?.transaction_date ?? "",
    ball_count: tx?.ball_count ?? "",
    cash_amount: tx?.cash_amount ?? "",
    memo: tx?.memo ?? "",
  };

  const title = isCashout ? `貯玉換金${isEdit ? "編集" : "の記録"}` : `貯玉残高調整${isEdit ? "編集" : ""}`;

  container.innerHTML = `
    ${errorMessage ? `<div class="alert alert-danger">${escapeHtml(errorMessage)}</div>` : ""}
    <h1>${title}（${escapeHtml(shop.name)}）</h1>
    <p class="muted small">現在の貯玉残高：${commas(balance)}枚</p>
    <form id="tx-form">
      <div class="field">
        <label>日付</label>
        <input type="date" id="f-date" required value="${values.transaction_date}">
      </div>
      <div class="field">
        <label>${isCashout ? "換金枚数" : "調整枚数（＋は増加、−は減少）"}</label>
        <input type="number" id="f-ball-count" ${isCashout ? "min=1" : ""} required value="${values.ball_count}">
      </div>
      ${
        isCashout
          ? `<div class="field">
              <label>受取現金額（円）</label>
              <input type="number" id="f-cash-amount" min="0" required value="${values.cash_amount}">
              <div class="hint">実際に受け取った金額をそのまま入力（計算はしない）。</div>
            </div>`
          : ""
      }
      <div class="field">
        <label>${isCashout ? "メモ" : "理由メモ（任意）"}</label>
        <textarea id="f-memo" rows="2" ${isCashout ? "" : 'placeholder="例：実際の残高と合わせた"'}>${escapeHtml(values.memo)}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">${isEdit ? "更新する" : "記録する"}</button>
      <a class="btn" href="${buildUrl(`/shops/${shopId}`)}">戻る</a>
      ${isEdit ? '<button type="button" class="btn btn-danger" id="delete-btn" style="float:right;">削除</button>' : ""}
    </form>
  `;

  container.querySelector("#tx-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = isCashout ? readCashoutForm(container) : readAdjustForm(container);
    try {
      if (isEdit) {
        await updateTransaction(db, shopId, txId, form);
        setFlash("履歴を更新しました。");
      } else if (isCashout) {
        await createCashout(db, shopId, form);
        setFlash("貯玉換金を記録しました。");
      } else {
        await createAdjust(db, shopId, form);
        setFlash("残高調整を記録しました。");
      }
      navigate(`/shops/${shopId}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderTransactionForm(container, db, { shopId, txId, type, errorMessage: err.message, formOverride: form });
      } else {
        throw err;
      }
    }
  });

  if (isEdit) {
    container.querySelector("#delete-btn").addEventListener("click", async () => {
      if (!window.confirm(isCashout ? "この換金履歴を削除しますか？" : "この残高調整を削除しますか？")) return;
      try {
        await deleteTransaction(db, shopId, txId);
        setFlash("履歴を削除しました。");
        navigate(`/shops/${shopId}`);
      } catch (err) {
        await renderTransactionForm(container, db, { shopId, txId, type, errorMessage: err.message });
      }
    });
  }
}
