/**
 * アプリの操作（記録の作成・編集・削除、店舗・機種マスタ、貯玉換金・残高調整）をまとめる層。
 * Flask版の app/routes/{records,shops,machines}.py に相当する。
 *
 * Flask版との大きな違い：
 * - record_realization_adjustments はDBに保存しない。店舗の台帳が変わっても
 *   「recalculate_shop_ledger」のような明示的な再計算呼び出しは不要で、
 *   表示のたびに computeDisplayProfits() / getShopRealization() がその場で導出する。
 * - 全ての公開関数は ValidationError を投げることがある。呼び出し側（UI）で
 *   catchしてメッセージを表示すること。
 */
import { STORE_NAMES, getAll, getAllByIndex, getById, add, put, remove, nameExists } from "./db.js";
import { calculateProfit, summarizeSavedBallUsageGain } from "./logic/profitCalculator.js";
import { getBalance, getBalanceHistory, getLedger } from "./logic/savedBallLedger.js";
import { recalculateShopLedger } from "./logic/savedBallRealization.js";
import {
  ValidationError,
  checkBalanceNeverNegative,
  checkEarnedNotExceedingPayout,
  parseIntField,
  parseFloatField,
  requireText,
  requireDate,
  toHalfWidth,
} from "./logic/validation.js";

const { SHOPS, MACHINES, RECORDS, SAVED_BALL_TRANSACTIONS, SHOP_MACHINES, SETTING_OBSERVATIONS } = STORE_NAMES;

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// 共通ヘルパー
// ---------------------------------------------------------------------------

async function getShopTransactions(db, shopId) {
  return getAllByIndex(db, SAVED_BALL_TRANSACTIONS, "shop_id", shopId);
}

async function getRecordTransactions(db, recordId) {
  return getAllByIndex(db, SAVED_BALL_TRANSACTIONS, "record_id", recordId);
}

/** この店舗に記録・貯玉履歴のいずれかがあるか（削除可否の判定に使う）。 */
export async function shopHasHistory(db, shopId) {
  const records = await getAllByIndex(db, RECORDS, "shop_id", shopId);
  if (records.length > 0) return true;
  const txs = await getShopTransactions(db, shopId);
  return txs.length > 0;
}

/** この機種に記録があるか。 */
export async function machineHasHistory(db, machineId) {
  const records = await getAllByIndex(db, RECORDS, "machine_id", machineId);
  return records.length > 0;
}

// ---------------------------------------------------------------------------
// 記録（records）
// ---------------------------------------------------------------------------

/**
 * フォーム相当の入力から、保存用フィールドを検証・組み立てる。
 * @param {object} form { play_date, shop_id, machine_id, machine_number, cash_investment,
 *   saved_ball_used, payout_count, saved_ball_earned, memo, manual_profit_amount }
 *   数値系はすべて文字列で渡してよい（全角数字も対応）。
 */
async function buildRecordFields(db, form, { excludeRecordId = null } = {}) {
  const playDate = requireDate(form.play_date, "日付");
  const shopId = parseIntField(form.shop_id, "店舗", { minimum: 1 });
  const machineId = parseIntField(form.machine_id, "機種", { minimum: 1 });
  const cashInvestment = parseIntField(form.cash_investment, "現金投資", { required: false, minimum: 0 });
  const savedBallUsed = parseIntField(form.saved_ball_used, "貯玉使用枚数", { required: false, minimum: 0 });
  const payoutCount = parseIntField(form.payout_count, "回収枚数", { required: false, minimum: 0 });
  const savedBallEarned = parseIntField(form.saved_ball_earned, "貯玉獲得数", { required: false, minimum: 0 });
  const machineNumber = (form.machine_number ?? "").trim() || null;
  const memo = (form.memo ?? "").trim() || null;

  checkEarnedNotExceedingPayout(savedBallEarned, payoutCount);

  const shop = await getById(db, SHOPS, shopId);
  if (!shop) throw new ValidationError("選択した店舗が見つかりません。");
  const machine = await getById(db, MACHINES, machineId);
  if (!machine) throw new ValidationError("選択した機種が見つかりません。");

  const exchangeRateUsed = shop.exchange_rate;
  const lendingRateUsed = shop.lending_rate;

  // この記録のuse/earnを除いた台帳に、新しい値のuse/earnを反映して
  // 残高が一度でもマイナスにならないかを検証する（record作成・編集どちらでも常に行う。
  // 貯玉獲得数を減らしただけでも、後の記録の使用分が足りなくなることがあるため）。
  const proposed = [];
  if (savedBallUsed > 0) proposed.push({ transaction_date: playDate, transaction_type: "use", ball_count: savedBallUsed });
  if (savedBallEarned > 0) proposed.push({ transaction_date: playDate, transaction_type: "earn", ball_count: savedBallEarned });
  const shopTxs = await getShopTransactions(db, shopId);
  checkBalanceNeverNegative(shopTxs, proposed, { excludeRecordId });

  let profitAmount;
  let profitIsManual;
  const manualRaw = (form.manual_profit_amount ?? "").toString().trim();
  if (manualRaw !== "") {
    const halfWidth = toHalfWidth(manualRaw);
    if (!/^-?\d+$/.test(halfWidth)) {
      throw new ValidationError("手動入力の収支金額には整数を入力してください。");
    }
    profitAmount = parseInt(halfWidth, 10);
    profitIsManual = 1;
  } else {
    profitAmount = calculateProfit(cashInvestment, savedBallUsed, payoutCount, exchangeRateUsed);
    profitIsManual = 0;
  }

  return {
    play_date: playDate,
    shop_id: shopId,
    machine_id: machineId,
    machine_number: machineNumber,
    cash_investment: cashInvestment,
    saved_ball_used: savedBallUsed,
    payout_count: payoutCount,
    saved_ball_earned: savedBallEarned,
    exchange_rate_used: exchangeRateUsed,
    lending_rate_used: lendingRateUsed,
    profit_amount: profitAmount,
    profit_is_manual: profitIsManual,
    memo,
  };
}

/** 記録保存時に、その記録に紐づく use/earn 行を作り直す（既存分はすべて削除してから作り直す）。 */
async function syncRecordTransactions(db, recordId, fields) {
  const existing = await getRecordTransactions(db, recordId);
  for (const tx of existing) {
    await remove(db, SAVED_BALL_TRANSACTIONS, tx.id);
  }
  if (fields.saved_ball_used > 0) {
    await add(db, SAVED_BALL_TRANSACTIONS, {
      shop_id: fields.shop_id,
      record_id: recordId,
      transaction_date: fields.play_date,
      transaction_type: "use",
      ball_count: fields.saved_ball_used,
      cash_amount: null,
      exchange_rate_used: null,
      memo: null,
    });
  }
  if (fields.saved_ball_earned > 0) {
    await add(db, SAVED_BALL_TRANSACTIONS, {
      shop_id: fields.shop_id,
      record_id: recordId,
      transaction_date: fields.play_date,
      transaction_type: "earn",
      ball_count: fields.saved_ball_earned,
      cash_amount: null,
      exchange_rate_used: fields.exchange_rate_used,
      memo: null,
    });
  }
}

export async function createRecord(db, form) {
  const fields = await buildRecordFields(db, form);
  const timestamp = nowIso();
  const recordId = await add(db, RECORDS, { ...fields, created_at: timestamp, updated_at: timestamp });
  await syncRecordTransactions(db, recordId, fields);
  return recordId;
}

export async function updateRecord(db, recordId, form) {
  const existing = await getById(db, RECORDS, recordId);
  if (!existing) throw new ValidationError("記録が見つかりませんでした。");
  const fields = await buildRecordFields(db, form, { excludeRecordId: recordId });
  await put(db, RECORDS, { ...existing, ...fields, id: recordId, updated_at: nowIso() });
  await syncRecordTransactions(db, recordId, fields);
  return recordId;
}

export async function deleteRecord(db, recordId) {
  const existing = await getById(db, RECORDS, recordId);
  if (!existing) return;

  // この記録の use/earn を丸ごと取り除いた場合に、他の記録・換金・調整が
  // 使っている分が足りなくなって残高がマイナスにならないかを確認する。
  const shopTxs = await getShopTransactions(db, existing.shop_id);
  checkBalanceNeverNegative(shopTxs, [], { excludeRecordId: recordId });

  const ownTxs = await getRecordTransactions(db, recordId);
  for (const tx of ownTxs) {
    await remove(db, SAVED_BALL_TRANSACTIONS, tx.id);
  }
  await remove(db, RECORDS, recordId);
}

export async function getRecord(db, recordId) {
  return getById(db, RECORDS, recordId);
}

export async function getRecordsForDate(db, date) {
  return getAllByIndex(db, RECORDS, "play_date", date);
}

/** "YYYY-MM" の月に属する記録を返す（play_dateの前方一致）。 */
export async function getRecordsForMonth(db, year, month) {
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const all = await getAll(db, RECORDS);
  return all.filter((r) => r.play_date.startsWith(prefix));
}

/**
 * 複数の記録に対して、表示用収支（profit_amount + 実現差額調整）をまとめて計算する。
 * @returns {Map<number, number>} record_id -> 表示用収支
 */
export async function computeDisplayProfits(db, records) {
  const shopIds = [...new Set(records.map((r) => r.shop_id))];
  const displayProfits = new Map();
  const adjustmentsByShop = new Map();

  for (const shopId of shopIds) {
    const txs = await getShopTransactions(db, shopId);
    adjustmentsByShop.set(shopId, recalculateShopLedger(txs).adjustmentsByRecordId);
  }

  for (const record of records) {
    const adjustments = adjustmentsByShop.get(record.shop_id);
    const adjustment = adjustments ? adjustments.get(record.id) || 0 : 0;
    displayProfits.set(record.id, record.profit_amount + adjustment);
  }
  return displayProfits;
}

/**
 * 条件で絞り込んだ記録を、新しい日付順に返す（表示用収支つき）。
 * @param {{shopId?: number|null, machineId?: number|null, dateFrom?: string|null, dateTo?: string|null}} filters
 *   すべて省略可。dateFrom/dateToは "YYYY-MM-DD"（両端を含む）。
 * @returns {Promise<Array>} 各要素に display_profit を追加した記録の配列
 */
export async function searchRecords(db, filters = {}) {
  const { shopId = null, machineId = null, dateFrom = null, dateTo = null } = filters;

  let records = await getAll(db, RECORDS);
  if (shopId !== null) records = records.filter((r) => r.shop_id === shopId);
  if (machineId !== null) records = records.filter((r) => r.machine_id === machineId);
  if (dateFrom) records = records.filter((r) => r.play_date >= dateFrom);
  if (dateTo) records = records.filter((r) => r.play_date <= dateTo);

  records.sort((a, b) => {
    if (a.play_date !== b.play_date) return a.play_date < b.play_date ? 1 : -1;
    return b.id - a.id;
  });

  const displayProfits = await computeDisplayProfits(db, records);
  return records.map((r) => ({ ...r, display_profit: displayProfits.get(r.id) ?? r.profit_amount }));
}

// ---------------------------------------------------------------------------
// 店舗（shops）
// ---------------------------------------------------------------------------

async function validateRate(raw, label) {
  return parseFloatField(raw, label, { minimum: 0 });
}

export async function createShop(db, form) {
  const name = requireText(form.name, "店舗名");
  if (await nameExists(db, SHOPS, name)) {
    throw new ValidationError("その店舗名はすでに登録されています。");
  }
  const exchangeRate = await validateRate(form.exchange_rate, "換金レート");
  const lendingRate = await validateRate(form.lending_rate, "貸し出しレート");
  const timestamp = nowIso();
  return add(db, SHOPS, {
    name,
    exchange_rate: exchangeRate,
    lending_rate: lendingRate,
    address: (form.address ?? "").trim() || null,
    memo: (form.memo ?? "").trim() || null,
    is_archived: 0,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

export async function updateShop(db, shopId, form) {
  const existing = await getById(db, SHOPS, shopId);
  if (!existing) throw new ValidationError("店舗が見つかりませんでした（削除済みの可能性があります）。");
  const name = requireText(form.name, "店舗名");
  if (await nameExists(db, SHOPS, name, shopId)) {
    throw new ValidationError("その店舗名はすでに登録されています。");
  }
  const exchangeRate = await validateRate(form.exchange_rate, "換金レート");
  const lendingRate = await validateRate(form.lending_rate, "貸し出しレート");
  await put(db, SHOPS, {
    ...existing,
    name,
    exchange_rate: exchangeRate,
    lending_rate: lendingRate,
    address: (form.address ?? "").trim() || null,
    memo: (form.memo ?? "").trim() || null,
    updated_at: nowIso(),
  });
}

export async function archiveShop(db, shopId) {
  const shop = await getById(db, SHOPS, shopId);
  if (!shop) return;
  await put(db, SHOPS, { ...shop, is_archived: 1, updated_at: nowIso() });
}

export async function unarchiveShop(db, shopId) {
  const shop = await getById(db, SHOPS, shopId);
  if (!shop) return;
  await put(db, SHOPS, { ...shop, is_archived: 0, updated_at: nowIso() });
}

export async function deleteShop(db, shopId) {
  if (await shopHasHistory(db, shopId)) {
    throw new ValidationError("この店舗には記録・貯玉履歴があるため削除できません。アーカイブを使ってください。");
  }
  await setInstalledMachines(db, shopId, []); // 設置機種のリンクも一緒に消す（孤立レコード防止）
  await remove(db, SHOPS, shopId);
}

export async function listShops(db, { includeArchived = false } = {}) {
  const all = await getAll(db, SHOPS);
  const filtered = all.filter((s) => (includeArchived ? s.is_archived === 1 : s.is_archived !== 1));
  return filtered.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/**
 * アーカイブ状態を問わず「全ての」店舗を名前順で返す（listShopsは一覧のアーカイブ切り替え用で
 * アクティブ／アーカイブ済みのどちらか一方しか返さないため、記録検索の絞り込み選択肢など
 * 「過去のものも含めて全部」欲しい場面ではこちらを使う）。
 */
export async function listAllShops(db) {
  const all = await getAll(db, SHOPS);
  return all.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function getShop(db, shopId) {
  return getById(db, SHOPS, shopId);
}

export async function getShopBalance(db, shopId) {
  const txs = await getShopTransactions(db, shopId);
  return getBalance(txs);
}

export async function getShopSavedBallUsageGain(db, shopId) {
  const records = await getAllByIndex(db, RECORDS, "shop_id", shopId);
  return summarizeSavedBallUsageGain(records);
}

export async function getShopBalanceHistory(db, shopId) {
  const txs = await getShopTransactions(db, shopId);
  return getBalanceHistory(txs);
}

export async function getShopRealization(db, shopId) {
  const txs = await getShopTransactions(db, shopId);
  return recalculateShopLedger(txs);
}

/** 店舗の貯玉増減履歴を、機種名・記録日付を付加した形で時系列順に返す。 */
export async function getShopLedgerDetailed(db, shopId) {
  const txs = await getShopTransactions(db, shopId);
  const sorted = getLedger(txs);
  const result = [];
  for (const tx of sorted) {
    let machineName = null;
    let recordPlayDate = null;
    if (tx.record_id !== null && tx.record_id !== undefined) {
      const record = await getById(db, RECORDS, tx.record_id);
      if (record) {
        recordPlayDate = record.play_date;
        const machine = await getById(db, MACHINES, record.machine_id);
        machineName = machine ? machine.name : null;
      }
    }
    result.push({ ...tx, machine_name: machineName, record_play_date: recordPlayDate });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 店舗ごとの設置機種（shop_machines）
// ---------------------------------------------------------------------------

/**
 * その店舗に設置されている機種を、名前順で返す。
 * アーカイブ済みの機種でも、設置リストに残っていれば含める（勝手に消さない。
 * 管理画面で外すかどうかは利用者が判断する）。
 */
export async function getInstalledMachines(db, shopId) {
  const links = await getAllByIndex(db, SHOP_MACHINES, "shop_id", shopId);
  const machines = [];
  for (const link of links) {
    const machine = await getById(db, MACHINES, link.machine_id);
    if (machine) machines.push(machine);
  }
  return machines.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** その店舗に設置されている機種のidの集合を返す（記録フォームの絞り込み判定などに使う）。 */
export async function getInstalledMachineIds(db, shopId) {
  const links = await getAllByIndex(db, SHOP_MACHINES, "shop_id", shopId);
  return new Set(links.map((l) => l.machine_id));
}

/**
 * その店舗の設置機種一覧を、渡された machineIds の集合に丸ごと置き換える
 * （チェックボックスの一覧画面から、選ばれている分だけをまとめて保存する想定）。
 */
export async function setInstalledMachines(db, shopId, machineIds) {
  const existing = await getAllByIndex(db, SHOP_MACHINES, "shop_id", shopId);
  for (const link of existing) {
    await remove(db, SHOP_MACHINES, link.id);
  }
  for (const machineId of machineIds) {
    await add(db, SHOP_MACHINES, { shop_id: shopId, machine_id: machineId });
  }
}

// ---------------------------------------------------------------------------
// 設定判別ツールの観測記録（setting_observations）
// ---------------------------------------------------------------------------

/**
 * フォーム入力から setting_observations の1件分のフィールドを組み立てる。
 * 判別基準は機種ごとに全く違うため、ここでは数値の妥当性チェックだけ行い、
 * 理論値との突き合わせ（推定）は js/logic/settingReference/ 側の責務にする。
 */
function toOptionalNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * 周期メモ（[{display_game, hit, via?, linked_miko_id?}]）を保存用に正規化する。
 * via:"miko" は、巫女ポイント0メモ側の当選をきっかけに画面が自動で追加した区切りエントリ（周期のリセット用）。
 * linked_miko_idは、対応する巫女ポイント0メモのエントリのid（削除・取消を連動させるため）。
 */
function normalizePeriodLog(log) {
  if (!Array.isArray(log)) return [];
  return log.map((e) => ({
    display_game: toOptionalNonNegativeInt(e.display_game),
    hit: Boolean(e.hit),
    via: e.via === "miko" ? "miko" : null,
    linked_miko_id: e.linked_miko_id ?? null,
  }));
}

/** 巫女ポイント0メモ（[{id, total_game, won, kansuke}]）を保存用に正規化する。idは周期メモとの連動に使う。 */
function normalizeMikoLog(log) {
  if (!Array.isArray(log)) return [];
  return log.map((e) => {
    const won = Boolean(e.won);
    return {
      id: e.id ?? null,
      total_game: toOptionalNonNegativeInt(e.total_game),
      won, // 乙女アタック（CZ）当選
      // AT当選（乙女アタック当選時のみ）。at_won導入前のデータは「乙女アタック当選＝AT当選」として
      // 周期メモに区切りを入れていたので、未設定なら当選扱いのまま読み込む。
      at_won: won ? (e.at_won === undefined || e.at_won === null ? true : Boolean(e.at_won)) : false,
      kansuke: Boolean(e.kansuke),
    };
  });
}

/** AT中CZメモ（本能寺の変・カシンバトル、[{id, kind, trigger, at_game, won}]）を保存用に正規化する。 */
function normalizeAtCzLog(log) {
  if (!Array.isArray(log)) return [];
  return log
    .filter((e) => e && typeof e.kind === "string" && e.kind !== "")
    .map((e) => ({
      id: e.id ?? null,
      kind: String(e.kind),
      trigger: String(e.trigger ?? ""),
      at_game: toOptionalNonNegativeInt(e.at_game),
      won: Boolean(e.won),
    }));
}

/** 景之STメモ（[{id, ura}]）を保存用に正規化する。 */
function normalizeKageLog(log) {
  if (!Array.isArray(log)) return [];
  return log.map((entry) => ({ id: entry.id ?? null, ura: Boolean(entry.ura) }));
}

/** 汎用の成否メモ（[{id, win}]）を保存用に正規化する。 */
function normalizeResultLog(log) {
  if (!Array.isArray(log)) return [];
  return log.map((entry) => ({ id: entry.id ?? null, win: Boolean(entry.win) }));
}

/** 乙女ストラップ等の出現回数（{キー: 回数}）を保存用に正規化する。 */
function normalizeStrapCounts(counts) {
  const result = {};
  if (counts && typeof counts === "object") {
    for (const [key, value] of Object.entries(counts)) {
      const n = toOptionalNonNegativeInt(value);
      if (n) result[key] = n;
    }
  }
  return result;
}

function parseActualSetting(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const value = parseIntField(String(raw), "実際の設定", { required: false, minimum: 1 });
  if (value > 6) throw new ValidationError("実際の設定は1〜6で入力してください。");
  return value;
}

function buildSettingObservationFields(form) {
  const parseOptionalCount = (raw, label) =>
    raw === null || raw === undefined || String(raw).trim() === ""
      ? null
      : parseIntField(String(raw), label, { required: false, minimum: 0 });
  const gameCount = parseIntField(form.game_count, "通常ゲーム数", { required: false, minimum: 0 });
  // 東京喰種・真打 吉宗は空欄＝未計測を0回と区別する。戦国乙女5は従来どおり空欄を0回として扱う。
  const atCount =
    form.machine_key === "tokyo_ghoul" || form.machine_key === "shinuchi_yoshimune"
      ? parseOptionalCount(form.at_count, "AT初当たり回数")
      : parseIntField(form.at_count, "AT当選回数", { required: false, minimum: 0 });
  // 総ゲーム数（AT消化分も含む）は空欄＝「記録していない」としてnullのまま保存する（推定には使わない）。
  const totalRaw = form.total_game_count;
  const totalGameCount =
    totalRaw === null || totalRaw === undefined || String(totalRaw).trim() === ""
      ? null
      : parseIntField(String(totalRaw), "総ゲーム数", { required: false, minimum: 0 });
  const mikoReachCount = parseIntField(form.miko_reach_count, "巫女ポイント0到達回数", { required: false, minimum: 0 });
  const czWinCount = parseIntField(form.cz_win_count, "CZ当選回数", { required: false, minimum: 0 });
  // ボーナス直撃は空欄＝「数えていない」としてnullのまま保存する（推定に使わないため）。
  const bonusRaw = form.bonus_direct_count;
  const bonusDirectCount =
    bonusRaw === null || bonusRaw === undefined || String(bonusRaw).trim() === ""
      ? null
      : parseIntField(String(bonusRaw), "ボーナス直撃回数", { required: false, minimum: 0 });

  const bonusCount = parseOptionalCount(form.bonus_count, "ボーナス初当たり回数");
  const stCount = parseOptionalCount(form.st_count, "ST初当たり回数");
  const bellCount = parseOptionalCount(form.bell_count, "下段ベル回数");
  const czRemiCount = parseOptionalCount(form.cz_remi_count, "レミニセンス回数");
  const czRizeCount = parseOptionalCount(form.cz_rize_count, "大喰いの利世回数");
  const episodeCount = parseOptionalCount(form.episode_count, "エピソードボーナス回数");
  const replayDirectCount = parseOptionalCount(form.replay_direct_count, "リプレイからのAT直撃回数");
  const lowerReplayCount = parseOptionalCount(form.lower_replay_count, "下段リプレイ回数");
  const czCount = parseOptionalCount(form.cz_count, "CZ総回数");
  const directAtCount = parseOptionalCount(form.direct_at_count, "直撃AT回数");
  const yagyuCount = parseOptionalCount(form.yagyu_count, "柳生回数");

  // AT中ゲーム数は空欄＝「手で数えていない」（画面側で総ゲーム数−通常ゲーム数の目安を使う）。
  const atGameRaw = form.at_game_count;
  const atGameCount =
    atGameRaw === null || atGameRaw === undefined || String(atGameRaw).trim() === ""
      ? null
      : parseIntField(String(atGameRaw), "AT中ゲーム数", { required: false, minimum: 0 });

  if (atCount !== null && atCount > gameCount) {
    throw new ValidationError("AT当選回数が通常ゲーム数を超えています。");
  }
  if (czWinCount > mikoReachCount) {
    throw new ValidationError("CZ当選回数が巫女ポイント0到達回数を超えています。");
  }
  if (totalGameCount !== null && totalGameCount < gameCount) {
    throw new ValidationError("総ゲーム数が通常ゲーム数を下回っています。");
  }
  if (czCount !== null && yagyuCount !== null && yagyuCount > czCount) {
    throw new ValidationError("柳生回数がCZ総回数を超えています。");
  }

  return {
    machine_key: (form.machine_key ?? "").toString().trim(),
    shop_id: form.shop_id ? Number(form.shop_id) : null,
    machine_id: form.machine_id ? Number(form.machine_id) : null,
    play_date: requireDate(form.play_date, "日付"),
    machine_number: (form.machine_number ?? "").toString().trim(),
    game_count: gameCount,
    total_game_count: totalGameCount,
    at_count: atCount,
    miko_reach_count: mikoReachCount,
    cz_win_count: czWinCount,
    bonus_direct_count: bonusDirectCount,
    bonus_count: bonusCount,
    st_count: stCount,
    bell_count: bellCount,
    cz_remi_count: czRemiCount,
    cz_rize_count: czRizeCount,
    episode_count: episodeCount,
    replay_direct_count: replayDirectCount,
    lower_replay_count: lowerReplayCount,
    cz_count: czCount,
    direct_at_count: directAtCount,
    yagyu_count: yagyuCount,
    max_ending_stamp: (form.max_ending_stamp ?? "none").toString(),
    max_payout_over: (form.max_payout_over ?? "none").toString(),
    ceiling_reset_hint: Boolean(form.ceiling_reset_hint),
    // 実際の設定（判明したときだけ入力。空欄＝不明）。推定の答え合わせ用で、計算には使わない。
    actual_setting: parseActualSetting(form.actual_setting),
    period_log: normalizePeriodLog(form.period_log),
    miko_log: normalizeMikoLog(form.miko_log),
    at_game_count: atGameCount,
    at_cz_log: normalizeAtCzLog(form.at_cz_log),
    kage_log: normalizeKageLog(form.kage_log),
    cz100_log: normalizeResultLog(form.cz100_log),
    pullback_log: normalizeResultLog(form.pullback_log),
    batto_log: normalizeResultLog(form.batto_log),
    hint_flags: Array.isArray(form.hint_flags) ? form.hint_flags.map(String) : [],
    strap_counts: normalizeStrapCounts(form.strap_counts),
    memo: (form.memo ?? "").toString().trim(),
  };
}

export async function createSettingObservation(db, form) {
  const fields = buildSettingObservationFields(form);
  const timestamp = nowIso();
  return add(db, SETTING_OBSERVATIONS, { ...fields, created_at: timestamp, updated_at: timestamp });
}

export async function updateSettingObservation(db, observationId, form) {
  const existing = await getById(db, SETTING_OBSERVATIONS, observationId);
  if (!existing) throw new ValidationError("観測記録が見つかりませんでした。");
  const fields = buildSettingObservationFields(form);
  await put(db, SETTING_OBSERVATIONS, { ...existing, ...fields, id: observationId, updated_at: nowIso() });
  return observationId;
}

export async function deleteSettingObservation(db, observationId) {
  await remove(db, SETTING_OBSERVATIONS, observationId);
}

export async function getSettingObservation(db, observationId) {
  return getById(db, SETTING_OBSERVATIONS, observationId);
}

/** 指定した店舗・機種の観測記録を、日付の新しい順で返す。 */
export async function listSettingObservations(db, { shopId, machineId } = {}) {
  let rows = await getAll(db, SETTING_OBSERVATIONS);
  if (shopId != null) rows = rows.filter((r) => r.shop_id === shopId);
  if (machineId != null) rows = rows.filter((r) => r.machine_id === machineId);
  return rows.sort((a, b) => (a.play_date < b.play_date ? 1 : a.play_date > b.play_date ? -1 : b.id - a.id));
}

// ---------------------------------------------------------------------------
// 貯玉換金・残高調整（saved_ball_transactions の cashout / adjust）
// ---------------------------------------------------------------------------

export async function createCashout(db, shopId, form) {
  const shop = await getById(db, SHOPS, shopId);
  if (!shop) throw new ValidationError("店舗が見つかりませんでした（削除済みの可能性があります）。");

  const transactionDate = requireDate(form.transaction_date, "日付");
  const ballCount = parseIntField(form.ball_count, "換金枚数", { minimum: 1 });
  const cashAmount = parseIntField(form.cash_amount, "受取現金額", { minimum: 0 });

  const shopTxs = await getShopTransactions(db, shopId);
  checkBalanceNeverNegative(shopTxs, [{ transaction_date: transactionDate, transaction_type: "cashout", ball_count: ballCount }]);

  return add(db, SAVED_BALL_TRANSACTIONS, {
    shop_id: shopId,
    record_id: null,
    transaction_date: transactionDate,
    transaction_type: "cashout",
    ball_count: ballCount,
    cash_amount: cashAmount,
    exchange_rate_used: null,
    memo: (form.memo ?? "").trim() || null,
  });
}

export async function createAdjust(db, shopId, form) {
  const shop = await getById(db, SHOPS, shopId);
  if (!shop) throw new ValidationError("店舗が見つかりませんでした（削除済みの可能性があります）。");

  const transactionDate = requireDate(form.transaction_date, "日付");
  const ballCount = parseIntField(form.ball_count, "調整枚数");
  if (ballCount === 0) throw new ValidationError("調整枚数は0以外の値を入力してください。");
  if (ballCount < 0) {
    const shopTxs = await getShopTransactions(db, shopId);
    checkBalanceNeverNegative(shopTxs, [{ transaction_date: transactionDate, transaction_type: "adjust", ball_count: ballCount }]);
  }

  return add(db, SAVED_BALL_TRANSACTIONS, {
    shop_id: shopId,
    record_id: null,
    transaction_date: transactionDate,
    transaction_type: "adjust",
    ball_count: ballCount,
    cash_amount: null,
    exchange_rate_used: ballCount > 0 ? shop.exchange_rate : null,
    memo: (form.memo ?? "").trim() || null,
  });
}

/** 換金・残高調整（cashout/adjust）の履歴を編集する。earn/useはここでは扱わない。 */
export async function updateTransaction(db, shopId, txId, form) {
  const tx = await getById(db, SAVED_BALL_TRANSACTIONS, txId);
  if (!tx || tx.shop_id !== shopId || !["cashout", "adjust"].includes(tx.transaction_type)) {
    throw new ValidationError("編集できない履歴です。");
  }
  const shop = await getById(db, SHOPS, shopId);
  const transactionDate = requireDate(form.transaction_date, "日付");
  const shopTxs = await getShopTransactions(db, shopId);

  if (tx.transaction_type === "cashout") {
    const ballCount = parseIntField(form.ball_count, "換金枚数", { minimum: 1 });
    const cashAmount = parseIntField(form.cash_amount, "受取現金額", { minimum: 0 });
    checkBalanceNeverNegative(
      shopTxs,
      [{ transaction_date: transactionDate, transaction_type: "cashout", ball_count: ballCount }],
      { excludeTransactionId: txId }
    );
    await put(db, SAVED_BALL_TRANSACTIONS, {
      ...tx,
      transaction_date: transactionDate,
      ball_count: ballCount,
      cash_amount: cashAmount,
      memo: (form.memo ?? "").trim() || null,
    });
  } else {
    const ballCount = parseIntField(form.ball_count, "調整枚数");
    if (ballCount === 0) throw new ValidationError("調整枚数は0以外の値を入力してください。");
    if (ballCount < 0) {
      checkBalanceNeverNegative(
        shopTxs,
        [{ transaction_date: transactionDate, transaction_type: "adjust", ball_count: ballCount }],
        { excludeTransactionId: txId }
      );
    }
    await put(db, SAVED_BALL_TRANSACTIONS, {
      ...tx,
      transaction_date: transactionDate,
      ball_count: ballCount,
      exchange_rate_used: ballCount > 0 ? shop.exchange_rate : null,
      memo: (form.memo ?? "").trim() || null,
    });
  }
}

export async function deleteTransaction(db, shopId, txId) {
  const tx = await getById(db, SAVED_BALL_TRANSACTIONS, txId);
  if (!tx || tx.shop_id !== shopId || !["cashout", "adjust"].includes(tx.transaction_type)) {
    throw new ValidationError("削除できない履歴です。");
  }
  const shopTxs = await getShopTransactions(db, shopId);
  checkBalanceNeverNegative(shopTxs, [], { excludeTransactionId: txId });
  await remove(db, SAVED_BALL_TRANSACTIONS, txId);
}

// ---------------------------------------------------------------------------
// 機種（machines）
// ---------------------------------------------------------------------------

export async function createMachine(db, form) {
  const name = requireText(form.name, "機種名");
  if (await nameExists(db, MACHINES, name)) {
    throw new ValidationError("その機種名はすでに登録されています。");
  }
  const timestamp = nowIso();
  return add(db, MACHINES, {
    name,
    maker: (form.maker ?? "").trim() || null,
    memo: (form.memo ?? "").trim() || null,
    is_archived: 0,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

export async function updateMachine(db, machineId, form) {
  const existing = await getById(db, MACHINES, machineId);
  if (!existing) throw new ValidationError("機種が見つかりませんでした。");
  const name = requireText(form.name, "機種名");
  if (await nameExists(db, MACHINES, name, machineId)) {
    throw new ValidationError("その機種名はすでに登録されています。");
  }
  await put(db, MACHINES, {
    ...existing,
    name,
    maker: (form.maker ?? "").trim() || null,
    memo: (form.memo ?? "").trim() || null,
    updated_at: nowIso(),
  });
}

export async function archiveMachine(db, machineId) {
  const machine = await getById(db, MACHINES, machineId);
  if (!machine) return;
  await put(db, MACHINES, { ...machine, is_archived: 1, updated_at: nowIso() });
}

export async function unarchiveMachine(db, machineId) {
  const machine = await getById(db, MACHINES, machineId);
  if (!machine) return;
  await put(db, MACHINES, { ...machine, is_archived: 0, updated_at: nowIso() });
}

/**
 * 機種名のリストをまとめて登録する（P-WORLDスクレイピング結果の貼り付けなど向け）。
 * 空行・重複行・既存の機種名はスキップし、新規分だけ登録する。
 */
export async function bulkCreateMachines(db, rawNames) {
  const seen = new Set();
  const created = [];
  const skipped = [];
  for (const raw of rawNames) {
    const name = (raw ?? "").trim();
    if (!name || seen.has(name) || (await nameExists(db, MACHINES, name))) {
      if (name) skipped.push(name);
      continue;
    }
    seen.add(name);
    const timestamp = nowIso();
    await add(db, MACHINES, { name, maker: null, memo: null, is_archived: 0, created_at: timestamp, updated_at: timestamp });
    created.push(name);
  }
  return { created, skipped };
}

export async function deleteMachine(db, machineId) {
  if (await machineHasHistory(db, machineId)) {
    throw new ValidationError("この機種には記録があるため削除できません。アーカイブを使ってください。");
  }
  // どの店舗の設置リストに載っていても、機種自体が消えるならリンクも一緒に消す
  const links = await getAllByIndex(db, SHOP_MACHINES, "machine_id", machineId);
  for (const link of links) {
    await remove(db, SHOP_MACHINES, link.id);
  }
  await remove(db, MACHINES, machineId);
}

export async function listMachines(db, { includeArchived = false } = {}) {
  const all = await getAll(db, MACHINES);
  const filtered = all.filter((m) => (includeArchived ? m.is_archived === 1 : m.is_archived !== 1));
  return filtered.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** アーカイブ状態を問わず「全ての」機種を名前順で返す（listMachinesとの違いはlistAllShopsと同様）。 */
export async function listAllMachines(db) {
  const all = await getAll(db, MACHINES);
  return all.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function getMachine(db, machineId) {
  return getById(db, MACHINES, machineId);
}

/** 記録がある年の範囲（最小・最大）を返す。1件も無ければnull。カレンダーの年月ピッカー用。 */
export async function getRecordYearRange(db) {
  const records = await getAll(db, RECORDS);
  if (records.length === 0) return null;
  const years = records.map((r) => parseInt(r.play_date.slice(0, 4), 10));
  return { min: Math.min(...years), max: Math.max(...years) };
}

// ---------------------------------------------------------------------------
// 収支分析（reports）：Flask版 app/routes/reports.py 相当の集計
// ---------------------------------------------------------------------------

/** 表示用収支つきの全記録を返す（集計関数の共通の下ごしらえ）。 */
async function getAllRecordsWithDisplayProfit(db) {
  const records = await getAll(db, RECORDS);
  const displayProfits = await computeDisplayProfits(db, records);
  return records.map((r) => ({ ...r, display_profit: displayProfits.get(r.id) ?? r.profit_amount }));
}

/** 年別集計。新しい年が先頭になるよう降順で返す。 */
export async function getYearlyTotals(db) {
  const records = await getAllRecordsWithDisplayProfit(db);
  const byYear = new Map();
  for (const r of records) {
    const year = r.play_date.slice(0, 4);
    const entry = byYear.get(year) || { year, playCount: 0, total: 0 };
    entry.playCount += 1;
    entry.total += r.display_profit;
    byYear.set(year, entry);
  }
  return [...byYear.values()].sort((a, b) => b.year.localeCompare(a.year));
}

/** 月別集計（全期間）。古い月が先頭になるよう昇順で返す（グラフ用）。表・直近N件は呼び出し側で加工する。 */
export async function getMonthlyTotals(db) {
  const records = await getAllRecordsWithDisplayProfit(db);
  const byMonth = new Map();
  for (const r of records) {
    const ym = r.play_date.slice(0, 7);
    const entry = byMonth.get(ym) || { ym, playCount: 0, total: 0 };
    entry.playCount += 1;
    entry.total += r.display_profit;
    byMonth.set(ym, entry);
  }
  return [...byMonth.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

/** 機種別集計。合計収支の降順。 */
export async function getMachineTotals(db) {
  const records = await getAllRecordsWithDisplayProfit(db);
  const machines = await getAll(db, MACHINES);
  const nameById = new Map(machines.map((m) => [m.id, m.name]));
  const byMachine = new Map();
  for (const r of records) {
    const entry = byMachine.get(r.machine_id) || {
      machineId: r.machine_id,
      machineName: nameById.get(r.machine_id) || "(不明)",
      playCount: 0,
      total: 0,
    };
    entry.playCount += 1;
    entry.total += r.display_profit;
    byMachine.set(r.machine_id, entry);
  }
  return [...byMachine.values()]
    .map((e) => ({ ...e, avgProfit: e.total / e.playCount }))
    .sort((a, b) => b.total - a.total);
}

/** 店舗別集計。合計収支の降順。 */
export async function getShopTotals(db) {
  const records = await getAllRecordsWithDisplayProfit(db);
  const shops = await getAll(db, SHOPS);
  const nameById = new Map(shops.map((s) => [s.id, s.name]));
  const byShop = new Map();
  for (const r of records) {
    const entry = byShop.get(r.shop_id) || {
      shopId: r.shop_id,
      shopName: nameById.get(r.shop_id) || "(不明)",
      playCount: 0,
      total: 0,
    };
    entry.playCount += 1;
    entry.total += r.display_profit;
    byShop.set(r.shop_id, entry);
  }
  return [...byShop.values()].sort((a, b) => b.total - a.total);
}

/** 店舗別の貯玉換金額合計（参考情報。収支合計には混ぜない）。 */
export async function getCashoutTotalsByShop(db) {
  const txs = await getAll(db, SAVED_BALL_TRANSACTIONS);
  const shops = await getAll(db, SHOPS);
  const nameById = new Map(shops.map((s) => [s.id, s.name]));
  const byShop = new Map();
  for (const t of txs) {
    if (t.transaction_type !== "cashout") continue;
    const entry = byShop.get(t.shop_id) || { shopId: t.shop_id, shopName: nameById.get(t.shop_id) || "(不明)", totalCashout: 0 };
    entry.totalCashout += t.cash_amount || 0;
    byShop.set(t.shop_id, entry);
  }
  return [...byShop.values()];
}

/** 獲得元の記録がない貯玉（残高調整由来）の換金差額（店舗別の「その他調整額」）。 */
export async function getOtherAdjustmentsByShop(db) {
  const shops = await getAll(db, SHOPS);
  const result = [];
  for (const shop of shops) {
    const realization = await getShopRealization(db, shop.id);
    if (realization.otherAdjustmentTotal !== 0) {
      result.push({ shopId: shop.id, shopName: shop.name, total: realization.otherAdjustmentTotal });
    }
  }
  return result;
}

export { ValidationError };
