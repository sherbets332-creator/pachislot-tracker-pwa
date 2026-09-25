/**
 * フォーム入力の検証（保存前チェック）。Flask版 app/services/validation.py の移植。
 *
 * 貯玉残高が保存の結果マイナスになってしまうケース（設計書6.4）を、
 * 保存前にここで弾く（IndexedDBにはSQLiteのCHECK制約のような仕組みが無いため、
 * ここでのチェックが唯一の砦になる）。
 */

const FULLWIDTH_TO_HALFWIDTH_MAP = (() => {
  const map = {};
  const fullwidth = "０１２３４５６７８９－";
  const halfwidth = "0123456789-";
  for (let i = 0; i < fullwidth.length; i += 1) {
    map[fullwidth[i]] = halfwidth[i];
  }
  return map;
})();

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export function toHalfWidth(text) {
  return text.replace(/[０-９－]/g, (ch) => FULLWIDTH_TO_HALFWIDTH_MAP[ch] ?? ch);
}

/**
 * 文字列を整数として取り出す。全角数字にも対応する。
 * @param {string} raw
 * @param {string} label エラーメッセージに使うラベル
 * @param {{required?: boolean, minimum?: number}} [options]
 */
export function parseIntField(raw, label, { required = true, minimum = null } = {}) {
  const trimmed = toHalfWidth((raw ?? "").trim());
  if (trimmed === "") {
    if (required) throw new ValidationError(`${label}を入力してください。`);
    return 0;
  }
  if (!/^-?\d+$/.test(trimmed)) {
    throw new ValidationError(`${label}には整数を入力してください。`);
  }
  const value = parseInt(trimmed, 10);
  if (minimum !== null && value < minimum) {
    throw new ValidationError(`${label}は${minimum}以上で入力してください。`);
  }
  return value;
}

export function parseFloatField(raw, label, { minimum = null } = {}) {
  const trimmed = toHalfWidth((raw ?? "").trim());
  if (trimmed === "") {
    throw new ValidationError(`${label}を入力してください。`);
  }
  const value = Number(trimmed);
  if (Number.isNaN(value)) {
    throw new ValidationError(`${label}には数値を入力してください。`);
  }
  if (minimum !== null && value <= minimum) {
    throw new ValidationError(`${label}は${minimum}より大きい値を入力してください。`);
  }
  return value;
}

export function requireText(raw, label) {
  const value = (raw ?? "").trim();
  if (!value) throw new ValidationError(`${label}を入力してください。`);
  return value;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function requireDate(raw, label) {
  const value = (raw ?? "").trim();
  if (!value) throw new ValidationError(`${label}を入力してください。`);
  if (!DATE_RE.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new ValidationError(`${label}の形式が正しくありません。`);
  }
  return value;
}

/** 貯玉獲得数は回収枚数の内訳なので、それを超えることはあり得ない（records.py由来のチェック）。 */
export function checkEarnedNotExceedingPayout(savedBallEarned, payoutCount) {
  if (savedBallEarned > payoutCount) {
    throw new ValidationError("貯玉獲得数が回収枚数を超えています。");
  }
}

/**
 * この変更を反映した場合に、貯玉残高が一度でもマイナスになるかを検証する。
 *
 * @param {Array} transactions 対象店舗の既存取引配列（除外前、フル）
 * @param {Array<{transaction_date: string, transaction_type: string, ball_count: number}>} proposed
 *   新しく追加/変更する取引（ball_countはadjustのみ符号付き、それ以外は正の値）
 * @param {{excludeRecordId?: number|null, excludeTransactionId?: number|null}} [options]
 *   excludeRecordId: 記録の編集時、その記録が持つ既存のuse/earn行を計算から除外する
 *   excludeTransactionId: cashout/adjustの編集・削除時、その行自体を計算から除外する
 */
export function checkBalanceNeverNegative(transactions, proposed, options = {}) {
  const { excludeRecordId = null, excludeTransactionId = null } = options;

  const filtered = transactions.filter((tx) => {
    if (excludeRecordId !== null && tx.record_id === excludeRecordId) return false;
    if (excludeTransactionId !== null && tx.id === excludeTransactionId) return false;
    return true;
  });

  const maxId = filtered.reduce((max, tx) => Math.max(max, tx.id), 0);

  const sequence = filtered.map((tx) => ({
    date: tx.transaction_date,
    id: tx.id,
    type: tx.transaction_type,
    ballCount: tx.ball_count,
  }));
  proposed.forEach((p, i) => {
    sequence.push({ date: p.transaction_date, id: maxId + i + 1, type: p.transaction_type, ballCount: p.ball_count });
  });
  sequence.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.id - b.id;
  });

  let balance = 0;
  for (const item of sequence) {
    if (item.type === "earn") balance += item.ballCount;
    else if (item.type === "use" || item.type === "cashout") balance -= item.ballCount;
    else if (item.type === "adjust") balance += item.ballCount;

    if (balance < 0) {
      throw new ValidationError(
        `貯玉残高が不足しています（${item.date}時点で残高が${balance}枚になります）。` +
          "枚数を確認するか、日付を見直してください。"
      );
    }
  }
}
