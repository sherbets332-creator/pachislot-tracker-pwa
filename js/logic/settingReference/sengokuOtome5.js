/**
 * 「戦国乙女5 業火を穿つ宿焔の双刃」（スマスロ）の設定判別 参考データ。
 *
 * 数値は公開されている解析サイトの情報をもとにしている（実機の公式発表値ではない場合を含む）。
 * あくまで「参考」であり、これだけで設定を断定できるものではない。
 *
 * 出典（2026-09調査時点）:
 * - https://nana-press.com/kaiseki/machine/1160/37314/
 * - https://chonborista.com/slot/orinpia-slot/256147/
 * - https://pachiseven.jp/articles/detail/26087
 * - https://p-town.dmm.com/specials/5110
 *
 * 調査したが設定別の数値が見つからなかったもの（2026-09時点）:
 * 周期テーブル（通常A/通常B/天国）への移行率・滞在率、引き戻しモード（AT終了後1周期目）の当選率は、
 * いずれも複数の解析サイトを確認したが「設定1のみ約40%」という概数しか公表されておらず、
 * 設定2〜6の数値が無いため推定（尤度）には組み込んでいない。なお「引き戻しモードの当選率」は
 * 実質的に本ファイルの`summarizePeriodLog`が返す1周期目当選率（`firstPeriodHitRate`）と同じ意味
 * （AT終了直後の1周期目＝引き戻しモード）なので、既存の周期メモ機能でカバーできている。
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

/**
 * ボーナス終了画面のスタンプ。到達したスタンプ以上で、その設定以上がほぼ濃厚とされる。
 * dwinImageNamesは「打-WIN LITE」(dwlite.heiwa.jp)のスタンプ画像ファイル名（拡張子抜き）との
 * 対応表（js/dwinImport.jsのmatchEndingStampFromImagesが使う）。可・吉・優は実際のページで
 * 確認済み（サイト側は「吉」を"kiti"と表記）。良・極は良い（＝未達成）の実例が無く、
 * ファイル名を確認できていないため、確認済みの自機種の値と同じ想定で推測を入れている（要検証）。
 */
export const ENDING_STAMPS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "ka", label: "可", minSetting: 2, dwinImageNames: ["ka"] }, // 確認済み
  { value: "kichi", label: "吉", minSetting: 3, dwinImageNames: ["kiti", "kichi"] }, // 確認済み（"kiti"表記）
  { value: "ryo", label: "良", minSetting: 4, dwinImageNames: ["ryo", "ryou"] }, // 未確認（推測）
  { value: "yu", label: "優", minSetting: 5, dwinImageNames: ["yu"] }, // 確認済み
  { value: "kiwami", label: "極", minSetting: 6, dwinImageNames: ["kiwami"] }, // 未確認（推測）
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
 * 天井（周期テーブルによらない、実ゲーム数の絶対上限）。通常は999G・6周期だが、設定変更があった日は
 * 650G・4周期に短縮される。設定の高低ではなく「今日、設定が触られた（据え置きではない）」ことの
 * 判別材料。ソース: pachiseven.jp「Ｌ戦国乙女5の設定推測＆設定6挙動まとめ」（2026-09時点）。
 */
export const NORMAL_CEILING_GAMES = 999;
export const NORMAL_CEILING_PERIODS = 6;
export const SETTING_CHANGE_CEILING_GAMES = 650;
export const SETTING_CHANGE_CEILING_PERIODS = 4;

/**
 * 周期メモ（[{display_game, hit, via?, linked_miko_id?}] の時系列）を、初当たりごとのまとまりに集計する。
 * AT当選（hit=true）の次の周期から数え直す。
 * 巫女ポイント0メモ側で乙女アタック→AT当選までした場合もAT初当たりなので、その時点で周期メモ側にも
 * via:"miko" の区切りエントリ（画面側が自動で追加）が入り、同様に次の周期は1周期目から数え直される。
 * 乙女アタックに当選してもATを取れなかった場合は区切りを入れない（周期はそのまま継続）。
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
 * 巫女ポイント0メモ1件がAT当選まで行ったか。流れは「巫女ポイント0 → 乙女アタック当否 → AT当否」で、
 * 乙女アタックに当選してもATを取れなければ周期はリセットされない。at_won導入前のデータ
 * （at_won未設定）は乙女アタック当選＝AT当選として扱う。
 */
export function isMikoAtWin(m) {
  if (!m || !m.won) return false;
  return m.at_won === undefined || m.at_won === null ? true : Boolean(m.at_won);
}

/**
 * 巫女ポイント0メモ（[{total_game, won, at_won, kansuke}]）を集計する。
 * won = 乙女アタック（CZ）当選、at_won = そこからAT当選。
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
    // 乙女アタック当選のうちAT当選まで行った回数（参考表示のみ。カンスケ中も含めた全件で数える）
    czWinTotal: mikoLog.filter((m) => m.won).length,
    atWinCount: mikoLog.filter((m) => isMikoAtWin(m)).length,
    kansukeCount: mikoLog.length - counted.length,
    averageInterval: intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : null,
  };
}

/**
 * AT中のCZ（記録用）。本能寺の変は通常AT中、カシンバトルは上位AT（真強カワラッシュ）中に起きる。
 * 画面では1つのブロックにまとめ、契機は共通の選択肢（AT_CZ_TRIGGERS）から選び、種類×勝敗のボタンで記録する。
 * 突入率・勝利期待度とも設定差ありとされるが、公開されている数値は設定1のみ（出典: ななプレス・
 * ちょんぼりすた・DMMぱちタウン、2026-10時点）。設定2〜6が不明なので推定（尤度）には使わず参考表示だけ。
 * 契機を分けて記録するのは、レア役契機はレア役を引けたかの運に左右され、G数契機（20G・以降50Gごと）と
 * 混ぜると数字の意味が変わるため。高確中（通常ATのミツヒデ高確、真強カワラッシュ中の高確）は突入しやすい
 * 特別な状態なのでさらに分ける。
 * setting1EntryRate: AT中1Gあたりの突入率（設定1）。カシンバトルは上位ATのゲーム数が取れないので無し。
 */
export const AT_CZ_TRIGGERS = [
  { value: "game", label: "G数" },
  { value: "rare", label: "レア役" },
  { value: "mitsuhide", label: "高確中" }, // 値は旧名（ミツヒデ高確）のまま。真強カワラッシュ中の高確も含む
  { value: "zekkei", label: "絶景チャンス" },
  { value: "other", label: "その他" },
];

export const AT_CZ_KINDS = [
  { key: "honnoji", label: "本能寺の変", shortLabel: "本能寺", setting1EntryRate: 1 / 114.8, setting1WinRate: 0.5 },
  { key: "kashin", label: "カシンバトル", shortLabel: "カシン", setting1EntryRate: null, setting1WinRate: 0.5 },
];

/**
 * AT中CZメモ（[{id, kind, trigger, at_game, won}]）をCZの種類ごと・契機ごとに集計する。
 * atGameCount（AT中ゲーム数）が分かれば、本能寺の変の突入率（参考）も出す。
 */
export function summarizeAtCzLog(atCzLog = [], { atGameCount = null } = {}) {
  return AT_CZ_KINDS.map((kind) => {
    const entries = atCzLog.filter((e) => e.kind === kind.key);
    const wins = entries.filter((e) => e.won).length;
    const byTrigger = AT_CZ_TRIGGERS
      .map((t) => {
        const ts = entries.filter((e) => e.trigger === t.value);
        return { trigger: t.value, label: t.label, count: ts.length, wins: ts.filter((e) => e.won).length };
      })
      .filter((t) => t.count > 0);
    const entryRate =
      kind.setting1EntryRate && atGameCount && atGameCount > 0 && entries.length > 0 ? entries.length / atGameCount : null;
    return {
      key: kind.key,
      label: kind.label,
      count: entries.length,
      wins,
      winRate: entries.length > 0 ? wins / entries.length : null,
      byTrigger,
      entryRate,
      setting1EntryRate: kind.setting1EntryRate,
      setting1WinRate: kind.setting1WinRate,
    };
  });
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
 *           cz_win_count?: number, max_ending_stamp?: string, max_payout_over?: string,
 *           ceiling_reset_hint?: boolean}} obs
 *   game_countは「通常ゲーム数」（AT・ボーナス消化を除く）で推定の分母に使う。total_game_countは
 *   AT消化分も含めた「総ゲーム数」で、参考表示のみ（推定には使わない）。ceiling_reset_hintは
 *   短縮天井（650G/4周期以内の強制AT当選）を見たかどうかで、設定変更（据え置きではない）の示唆
 *   （設定の高低とは別軸のため、尤度計算には使わずsettingChangeHintとしてそのまま返す）。
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
    // 短縮天井（650G/4周期以内の強制当選）を見た＝設定変更（据え置きではない）の示唆。設定の高低とは
    // 別軸の情報なので、尤度（likelihoods）には混ぜず別項目で返す。
    settingChangeHint: Boolean(obs.ceiling_reset_hint),
    samples,
    periodSummary,
    mikoSummary,
  };
}
