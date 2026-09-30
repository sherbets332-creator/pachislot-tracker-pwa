/**
 * 「戦国乙女5 業火を穿つ宿焔の双刃」（スマスロ）の設定判別 参考データ。
 *
 * 数値は公開されている解析サイトの情報をもとにしている（実機の公式発表値ではない場合を含む）。
 * あくまで「参考」であり、これだけで設定を断定できるものではない。
 *
 * 出典（2026-09調査時点）:
 * - https://nana-press.com/kaiseki/machine/1160/37314/
 * - https://chonborista.com/slot/orinpia-slot/256147/
 */
import { estimateSettingLikelihoods } from "../settingInference.js";

export const MACHINE_KEY = "sengoku_otome5";
export const MACHINE_NAME = "L戦国乙女5 業火を穿つ宿焔の双刃";
/** 以前の短い名前で機種マスタに登録済みの場合も対応機種として扱うための別名。 */
export const MACHINE_ALIASES = ["戦国乙女5"];

/** 設定1〜6の順（インデックス0=設定1）。 */
export const SETTING_LABELS = ["設定1", "設定2", "設定3", "設定4", "設定5", "設定6"];

/** AT初当たり確率（ボーナス直撃＋CZ勝利の合算）。 */
export const AT_PROBABILITY = [1 / 359.5, 1 / 350.8, 1 / 332.5, 1 / 302.8, 1 / 281.0, 1 / 262.9];

/** 巫女ポイント0pt到達時のCZ「乙女アタック」当選率。 */
export const CZ_WIN_RATE = [0.203, 0.214, 0.232, 0.247, 0.252, 0.257];

/** 戦国乙女ボーナス直撃（前兆無しの即当選）の出現率。滅多に起きないため参考程度。 */
export const BONUS_DIRECT_PROBABILITY = [1 / 21206.7, 1 / 15648.9, 1 / 13143.5, 1 / 8143.4, 1 / 6427.6, 1 / 5502.7];

/** 出玉率（機械割）の目安。 */
export const PAYOUT_RATE = [0.979, 0.989, 1.010, 1.062, 1.111, 1.149];

/** ボーナス終了画面のスタンプ。到達したスタンプ以上で、その設定以上がほぼ濃厚とされる。 */
export const ENDING_STAMPS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "ka", label: "可", minSetting: 2 },
  { value: "kichi", label: "吉", minSetting: 3 },
  { value: "ryo", label: "良", minSetting: 4 },
  { value: "yu", label: "優", minSetting: 5 },
  { value: "kiwami", label: "極", minSetting: 6 },
];

/** 終了画面の獲得枚数表示（「◯◯◯枚OVER」）。到達すればその設定以上が濃厚。 */
export const PAYOUT_OVER_HINTS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "p222", label: "222枚OVER", minSetting: 2 },
  { value: "p333", label: "333枚OVER", minSetting: 3 },
  { value: "p444", label: "444枚OVER", minSetting: 4 },
  { value: "p555", label: "555枚OVER", minSetting: 5 },
  { value: "p666", label: "666枚OVER", minSetting: 6 },
];

/**
 * 周期ごとのAT期待度（設定1、解析サイト公表値）。インデックス0=1周期目。6周期目は天井。
 * 高設定ほど優遇されるとされるが、設定別の数値は非公開のため推定（尤度）には使わず、比較表示だけに使う。
 */
export const PERIOD_AT_EXPECTATION_SETTING1 = [0.4, 0.4, 0.3, 0.3, 0.3, 1.0];

/**
 * 周期メモ（[{display_game, hit, via?, linked_miko_id?}] の時系列）を、初当たりごとのまとまりに集計する。
 * AT当選（hit=true）の次の周期から数え直す。
 * 巫女ポイント0メモ側で乙女アタックに当選した場合もAT初当たりなので、その時点で周期メモ側にも
 * via:"miko" の区切りエントリ（画面側が自動で追加）が入り、同様に次の周期は1周期目から数え直される。
 */
export function summarizePeriodLog(periodLog = []) {
  const hits = [];
  let current = [];
  for (const entry of periodLog) {
    current.push(entry);
    if (entry.hit) {
      hits.push({ period: current.length, entries: current });
      current = [];
    }
  }
  const firstPeriodHits = hits.filter((h) => h.period === 1).length;
  return {
    hits, // 初当たりごと: { period: 何周期目で当たったか, entries }
    ongoing: current, // 最後の初当たり以降、まだ当たっていない周期
    currentPeriod: current.length + 1, // 次に消化するのは何周期目か
    averageHitPeriod: hits.length > 0 ? hits.reduce((s, h) => s + h.period, 0) / hits.length : null,
    firstPeriodHitRate: hits.length > 0 ? firstPeriodHits / hits.length : null,
  };
}

/**
 * 巫女ポイント0メモ（[{total_game, won, kansuke}]）を集計する。
 * 乙女アタック当選率の解析値は「カンスケ滞在時を除く」数値なので、カンスケ中の分は判別の母数から外す。
 * total_gameを入力した回同士の差から、平均何G間隔で0ptに到達しているかも計算する（任意入力欄のため
 * 埋まっている回だけを対象にする。参考表示のみで、推定には使わない）。
 */
export function summarizeMikoLog(mikoLog = []) {
  const counted = mikoLog.filter((m) => !m.kansuke);
  const withGame = mikoLog.filter((m) => m.total_game !== null && m.total_game !== undefined);
  const intervals = [];
  for (let i = 1; i < withGame.length; i++) {
    const diff = withGame[i].total_game - withGame[i - 1].total_game;
    if (diff > 0) intervals.push(diff);
  }
  return {
    reachCount: counted.length,
    winCount: counted.filter((m) => m.won).length,
    kansukeCount: mikoLog.length - counted.length,
    averageInterval: intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : null,
  };
}

/**
 * 遊技中に見かけたらチェックする設定示唆（出典: 1geki.jp、2026-09時点）。
 * minSetting: 見えたら「設定◯以上濃厚」。parity: 奇数/偶数示唆（確定ではない）。
 */
export const SETTING_HINTS = [
  { value: "voice_kansha", group: "エンディング・ゴエモンボイス", label: "感謝、感謝！", parity: "odd" },
  { value: "voice_ayashii", group: "エンディング・ゴエモンボイス", label: "怪しい・・・！", parity: "even" },
  { value: "voice_sankyu", group: "エンディング・ゴエモンボイス", label: "さんきゅ～！", minSetting: 2 },
  { value: "voice_gokigen", group: "エンディング・ゴエモンボイス", label: "ご機嫌っしょ！", minSetting: 3 },
  { value: "voice_semedoki", group: "エンディング・ゴエモンボイス", label: "攻めどきっしょ！", minSetting: 4 },
  { value: "voice_ageage", group: "エンディング・ゴエモンボイス", label: "気分アゲアゲだし！", minSetting: 5 },
  { value: "voice_goemon", group: "エンディング・ゴエモンボイス", label: "石川ゴエモン登場", minSetting: 6 },
  { value: "at_end_gold", group: "AT終了画面", label: "乙女集合（金）", minSetting: 2 },
  { value: "haruruna_push", group: "その他", label: "ハルルナPUSH出現", minSetting: 4 },
  { value: "nagi_blue", group: "隠れ凪（推察）", label: "青文字", minSetting: 2 },
  { value: "nagi_green", group: "隠れ凪（推察）", label: "緑文字", minSetting: 3 },
  { value: "nagi_red", group: "隠れ凪（推察）", label: "赤文字", minSetting: 4 },
  { value: "nagi_silver", group: "隠れ凪（推察）", label: "銀文字", minSetting: 5 },
  { value: "nagi_gold", group: "隠れ凪（推察）", label: "金文字", minSetting: 6 },
];

/**
 * 乙女ストラップモード。ノブナガ・ゴエモン・ヒデヨシは出現率に設定差あり（数値は非公開のため推定には使わず、
 * 「出現するほど高設定期待」として回数を表示するだけ）。カンスケは乙女アタック当選率40.2%に優遇されるモード。
 */
export const STRAP_MODES = [
  { key: "nobunaga", label: "ノブナガ", settingDiff: true },
  { key: "goemon", label: "ゴエモン", settingDiff: true },
  { key: "hideyoshi", label: "ヒデヨシ", settingDiff: true },
  { key: "kansuke", label: "カンスケ", settingDiff: false },
  { key: "mitsuhide", label: "ミツヒデ", settingDiff: false },
  { key: "yoshiteru", label: "ヨシテル", settingDiff: false },
];

/** ストラップモードの出現回数を集計する。 */
export function summarizeStraps(strapCounts = {}) {
  const byKey = STRAP_MODES.map((m) => ({ ...m, count: Number(strapCounts[m.key]) || 0 }));
  return {
    byKey,
    settingDiffCount: byKey.filter((m) => m.settingDiff).reduce((s, m) => s + m.count, 0),
    totalCount: byKey.reduce((s, m) => s + m.count, 0),
  };
}

/** チェックされた示唆から、「設定◯以上濃厚」の根拠一覧と奇数/偶数示唆を返す。 */
export function summarizeHints(hintFlags = []) {
  const seen = SETTING_HINTS.filter((h) => hintFlags.includes(h.value));
  return {
    minSettingSources: seen.filter((h) => h.minSetting).map((h) => ({ label: `${h.group}「${h.label}」`, minSetting: h.minSetting })),
    oddCount: seen.filter((h) => h.parity === "odd").length,
    evenCount: seen.filter((h) => h.parity === "even").length,
  };
}

function findMinSetting(options, value) {
  const found = options.find((o) => o.value === value);
  return found ? found.minSetting : null;
}

/**
 * 1回の観測記録（1セッション分の入力値）から、設定ごとの相対尤度と示唆情報をまとめて返す。
 *
 * @param {{game_count?: number, total_game_count?: number, at_count?: number, miko_reach_count?: number,
 *           cz_win_count?: number, max_ending_stamp?: string, max_payout_over?: string}} obs
 *   game_countは「通常ゲーム数」（AT・ボーナス消化を除く）で推定の分母に使う。total_game_countは
 *   AT消化分も含めた「総ゲーム数」で、参考表示のみ（推定には使わない）。
 */
export function buildEstimate(obs) {
  const gameCount = Number(obs.game_count) || 0; // 通常ゲーム数（AT・ボーナス消化を除く）。推定の分母はこちら。
  const atCount = Number(obs.at_count) || 0;
  // 総ゲーム数（AT消化分も含む）は記録用の参考値で、推定計算には使わない。空欄なら null。
  const totalRaw = obs.total_game_count;
  const totalGameCount = totalRaw !== null && totalRaw !== undefined && String(totalRaw).trim() !== "" ? Number(totalRaw) || 0 : null;
  // 巫女ポイント0メモがあればそちらから集計する（カンスケ中を除外できるため、手入力の回数より優先）。
  const mikoLog = Array.isArray(obs.miko_log) ? obs.miko_log : [];
  const mikoSummary = summarizeMikoLog(mikoLog);
  const mikoReachCount = mikoLog.length > 0 ? mikoSummary.reachCount : Number(obs.miko_reach_count) || 0;
  const czWinCount = mikoLog.length > 0 ? mikoSummary.winCount : Number(obs.cz_win_count) || 0;
  const periodSummary = summarizePeriodLog(Array.isArray(obs.period_log) ? obs.period_log : []);

  // ボーナス直撃は空欄＝「数えていない」扱いで推定に使わない（0回として数えると低設定寄りに偏るため）。
  const bonusRaw = obs.bonus_direct_count;
  const bonusRecorded = bonusRaw !== null && bonusRaw !== undefined && String(bonusRaw).trim() !== "";
  const bonusDirectCount = bonusRecorded ? Number(bonusRaw) || 0 : null;

  const samples = [
    { key: "at", label: "AT初当たり", k: atCount, n: gameCount, rates: AT_PROBABILITY },
    { key: "cz", label: "CZ（乙女アタック）当選", k: czWinCount, n: mikoReachCount, rates: CZ_WIN_RATE },
  ];
  if (bonusRecorded) {
    samples.push({ key: "bonus", label: "戦国乙女ボーナス直撃", k: bonusDirectCount, n: gameCount, rates: BONUS_DIRECT_PROBABILITY });
  }

  const likelihoods = estimateSettingLikelihoods(samples);

  const hintSummary = summarizeHints(Array.isArray(obs.hint_flags) ? obs.hint_flags : []);
  const minSettingSources = [...hintSummary.minSettingSources];
  const stampMinSetting = findMinSetting(ENDING_STAMPS, obs.max_ending_stamp);
  if (stampMinSetting) {
    const s = ENDING_STAMPS.find((x) => x.value === obs.max_ending_stamp);
    minSettingSources.push({ label: `終了画面スタンプ「${s.label}」`, minSetting: stampMinSetting });
  }
  const payoutMinSetting = findMinSetting(PAYOUT_OVER_HINTS, obs.max_payout_over);
  if (payoutMinSetting) {
    const p = PAYOUT_OVER_HINTS.find((x) => x.value === obs.max_payout_over);
    minSettingSources.push({ label: `獲得枚数表示「${p.label}」`, minSetting: payoutMinSetting });
  }
  const hintMinSetting = Math.max(0, ...minSettingSources.map((s) => s.minSetting)) || null;

  return {
    settingLabels: SETTING_LABELS,
    likelihoods, // 長さ6、合計1
    observedAtRate: gameCount > 0 ? atCount / gameCount : null,
    observedCzRate: mikoReachCount > 0 ? czWinCount / mikoReachCount : null,
    observedBonusRate: bonusRecorded && gameCount > 0 ? bonusDirectCount / gameCount : null,
    totalGameCount, // 総ゲーム数（参考表示のみ、推定には未使用）
    hintMinSetting, // 示唆から言える「これ以上濃厚」の最低設定（無ければnull）
    minSettingSources, // その根拠一覧 [{label, minSetting}]
    parityHint: { odd: hintSummary.oddCount, even: hintSummary.evenCount },
    strapSummary: summarizeStraps(obs.strap_counts || {}),
    samples,
    periodSummary,
    mikoSummary,
  };
}
