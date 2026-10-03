/**
 * 「真打 吉宗」の設定判別 参考データ。
 *
 * 出典（2026-10調査時点）:
 * - https://nana-press.com/kaiseki/machine/1124/36099/
 * - https://nana-press.com/kaiseki/machine/1124/
 * - https://p-town.dmm.com/machines/4983
 *
 * 未確認事項:
 * - AT初当たりの解析値の分母は未確認。実機マイスロ画面で確認した対応に従い、
 *   暫定的に「通常プレイ数（CZ込みではない方）」= game_count を使う。要検証。
 * - CZ出現率が直撃ATを含むかは未確認。主推定は直撃を除く cz_count / game_count、
 *   direct_at_count 入力時は直撃込みの代替推定も返して並べる。要検証。
 * - 直撃ATは天井・モードC周期でも起きるため、高設定根拠として単独では扱わない。
 * - 柳生選択率はCZ総回数を母数、柳生の総回数を分子として扱う。
 * - 設定2〜5の機械割はchonborista掲載値。他サイトでは未確認。
 * - 共通ベルは情報が食い違うため入力・推定に使わない。
 * - QR・公式データ取り込みは実装しない。
 */
import { estimateSettingLikelihoods } from "../settingInference.js";

export const MACHINE_KEY = "shinuchi_yoshimune";
export const MACHINE_NAME = "真打 吉宗";
export const MACHINE_ALIASES = ["真打吉宗", "スマスロ 真打吉宗", "L真打 吉宗", "Ｌ真打 吉宗", "スマスロ 真打 吉宗"];
export const SETTING_LABELS = ["設定1", "設定2", "設定3", "設定4", "設定5", "設定6"];

export const AT_PROBABILITY = [1 / 488.9, 1 / 471.5, 1 / 438.5, 1 / 398.1, 1 / 377.0, 1 / 354.9];
export const CZ_PROBABILITY = [1 / 313.0, 1 / 303.0, 1 / 283.5, 1 / 267.1, 1 / 256.9, 1 / 250.6];
export const BATTO_RATE = [0.2031, 0.2227, 0.2227, 0.2422, 0.2422, 0.2578];
export const YAGYU_RATE = [0.037, 0.039, 0.047, 0.062, 0.0781, 0.087];
export const PAYOUT_RATE = [0.978, 0.986, 1.01, 1.045, 1.08, 1.14];

// 勧善懲悪RUSH突入、真高確率関連、真BIGの1G連、鷹ブレイクは設定差なしと明記されているため、
// 推定サンプルにも入力項目にも含めない。共通ベルは情報が食い違うため同様に含めない。

export const ENDING_STAMPS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "ooka_echizen", label: "大岡越前", minSetting: 2 },
  { value: "yagyu", label: "柳生", minSetting: 4 },
  { value: "oo_oku", label: "大奥", minSetting: 5 },
  { value: "yoshimune", label: "吉宗", minSetting: 6 },
];

export const ENDING_STAMP_FIELD_LABEL = "AT終了画面、その日一番高かったもの";

export const PAYOUT_OVER_HINTS = [
  { value: "none", label: "なし", minSetting: null },
  { value: "p456", label: "456枚突破", minSetting: 4 },
  { value: "p555", label: "555枚突破", minSetting: 5 },
  { value: "p666", label: "666枚突破", minSetting: 6 },
];

export const SETTING_HINTS = [
  { value: "ending_crescent", group: "AT終了画面", label: "三日月", note: "高設定示唆（弱・参考）" },
  { value: "ending_full_moon", group: "AT終了画面", label: "満月", note: "高設定示唆（強・参考）" },
  { value: "voice_aoi", group: "真BIG中ボイス", label: "葵「流石でございます！」", note: "奇数示唆（弱・参考）" },
  { value: "voice_sakura", group: "真BIG中ボイス", label: "桜「どごさ目いってんだが～？！」", note: "奇数示唆（強・参考）" },
  { value: "voice_midori", group: "真BIG中ボイス", label: "翠「やるじゃない！」", note: "偶数示唆（弱・参考）" },
  { value: "voice_kurenai", group: "真BIG中ボイス", label: "紅「早く捕まえてぇ～！」", note: "偶数示唆（強・参考）" },
  { value: "voice_teneiin_weak", group: "真BIG中ボイス", label: "天英院「やるではないか！」", note: "高設定示唆（弱・参考）" },
  { value: "voice_teneiin_strong", group: "真BIG中ボイス", label: "天英院「今宵は特別な日になる気がしておるぞ！」", note: "高設定示唆（強・参考）" },
  { value: "voice_yoshimune_2", group: "真BIG中ボイス", label: "吉宗「胸が高鳴るのう！！！」", minSetting: 2 },
  { value: "voice_echizen_4", group: "真BIG中ボイス", label: "越前「この越前！この上ない喜びである！」", minSetting: 4 },
  { value: "voice_yoshimune_5", group: "真BIG中ボイス", label: "吉宗「これで江戸も安泰じゃ！はっはっは！」", minSetting: 5 },
  { value: "voice_all_6", group: "真BIG中ボイス", label: "吉宗・越前・天英院「江戸を守る！」", minSetting: 6 },
  { value: "sub_echizen", group: "サブ液晶（御白州ビジョン）", label: "越前", note: "偶数示唆（参考）" },
  { value: "sub_teneiin", group: "サブ液晶（御白州ビジョン）", label: "天英院", note: "高設定示唆（参考）" },
  { value: "trophy_bronze", group: "コパンダトロフィー", label: "銅", note: "従来機種からの予想で未確認（設定2以上示唆・参考）" },
  { value: "trophy_silver", group: "コパンダトロフィー", label: "銀", note: "従来機種からの予想で未確認（設定3以上示唆・参考）" },
  { value: "trophy_gold", group: "コパンダトロフィー", label: "金", note: "従来機種からの予想で未確認（設定4以上示唆・参考）" },
  { value: "trophy_lightning", group: "コパンダトロフィー", label: "イナズマ", note: "従来機種からの予想で未確認（設定5以上示唆・参考）" },
  { value: "trophy_rainbow", group: "コパンダトロフィー", label: "虹", note: "従来機種からの予想で未確認（設定6示唆・参考）" },
];

export const SETTING_HINT_GROUP_NOTES = {
  "サブ液晶（御白州ビジョン）": "確認方法：AT終了後・CZ失敗後・ポイント特化ゾーン終了時にPUSH。",
};

export const BINARY_LOGS = [
  {
    key: "batto_log",
    idPrefix: "batto",
    title: "抜刀チャンスメモ",
    description: "メーターMAX時のみ。AT終了後の初回と5周期目は記録しないでください。",
    winLabel: "抜刀チャンス当選",
    loseLabel: "抜刀チャンス外れ",
    summaryLabel: "抜刀チャンス",
  },
];

export const ESTIMATE_DESCRIPTION =
  "AT初当たり・CZ出現・柳生選択率・抜刀チャンス当選率を設定1〜6で相対比較した簡易的な目安です。CZ出現率の直撃AT込み／除外は定義未確認のため、入力時は2通りを表示します。";

function isRecorded(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function optionalCount(value) {
  return isRecorded(value) ? Number(value) || 0 : null;
}

function findMinSetting(options, value) {
  return options.find((option) => option.value === value)?.minSetting ?? null;
}

export function summarizeResultLog(log = []) {
  const totalCount = log.length;
  const winCount = log.filter((entry) => entry.win).length;
  return { totalCount, winCount, winRate: totalCount > 0 ? winCount / totalCount : null };
}

function summarizeHints(hintFlags = []) {
  const seen = SETTING_HINTS.filter((hint) => hintFlags.includes(hint.value));
  return {
    minSettingSources: seen
      .filter((hint) => hint.minSetting)
      .map((hint) => ({ label: `${hint.group}「${hint.label}」`, minSetting: hint.minSetting })),
    excludedSettings: [...new Set(seen.flatMap((hint) => hint.excludes || []))].sort((a, b) => a - b),
    referenceNotes: seen.filter((hint) => hint.note).map((hint) => `${hint.group}「${hint.label}」：${hint.note}`),
  };
}

export function buildEstimate(obs) {
  // 要検証: 解析サイト側の分母定義が確定するまでは通常プレイ数を使う。
  const gameCount = Number(obs.game_count) || 0;
  const totalGameCount = isRecorded(obs.total_game_count) ? Number(obs.total_game_count) || 0 : null;
  const atCount = optionalCount(obs.at_count);
  const czCount = optionalCount(obs.cz_count);
  const directAtCount = optionalCount(obs.direct_at_count);
  const yagyuCount = optionalCount(obs.yagyu_count);
  if (czCount !== null && yagyuCount !== null && yagyuCount > czCount) {
    throw new RangeError("柳生回数がCZ総回数を超えています。");
  }
  const battoSummary = summarizeResultLog(Array.isArray(obs.batto_log) ? obs.batto_log : []);
  const samples = [];

  if (atCount !== null) samples.push({ key: "at", label: "AT初当たり", k: atCount, n: gameCount, rates: AT_PROBABILITY });
  if (czCount !== null) samples.push({ key: "cz", label: "CZ出現（直撃ATを除く）", k: czCount, n: gameCount, rates: CZ_PROBABILITY });
  if (czCount !== null && czCount > 0 && yagyuCount !== null) {
    samples.push({ key: "yagyu", label: "CZ当選時の柳生選択", k: yagyuCount, n: czCount, rates: YAGYU_RATE });
  }
  if (battoSummary.totalCount > 0) {
    samples.push({ key: "batto", label: "抜刀チャンス当選", k: battoSummary.winCount, n: battoSummary.totalCount, rates: BATTO_RATE });
  }

  const hintSummary = summarizeHints(Array.isArray(obs.hint_flags) ? obs.hint_flags : []);
  const minSettingSources = [...hintSummary.minSettingSources];
  const stampMinSetting = findMinSetting(ENDING_STAMPS, obs.max_ending_stamp);
  if (stampMinSetting) {
    const stamp = ENDING_STAMPS.find((item) => item.value === obs.max_ending_stamp);
    minSettingSources.push({ label: `AT終了画面「${stamp.label}」`, minSetting: stampMinSetting });
  }
  const payoutMinSetting = findMinSetting(PAYOUT_OVER_HINTS, obs.max_payout_over);
  if (payoutMinSetting) {
    const payout = PAYOUT_OVER_HINTS.find((item) => item.value === obs.max_payout_over);
    minSettingSources.push({ label: `獲得枚数表示「${payout.label}」`, minSetting: payoutMinSetting });
  }
  const hintMinSetting = Math.max(0, ...minSettingSources.map((source) => source.minSetting)) || null;

  const alternativeEstimates = [];
  if (directAtCount !== null && czCount !== null) {
    const alternativeSamples = samples.map((sample) =>
      sample.key === "cz" ? { ...sample, label: "CZ出現（直撃AT込み）", k: czCount + directAtCount } : sample
    );
    alternativeEstimates.push({
      label: "CZ直撃込みで計算",
      likelihoods: estimateSettingLikelihoods(alternativeSamples),
      note: "どちらの定義が正しいか未確認（要検証）",
    });
  }

  return {
    settingLabels: SETTING_LABELS,
    likelihoods: estimateSettingLikelihoods(samples),
    hintMinSetting,
    minSettingSources,
    samples,
    totalGameCount,
    observedMetrics: [
      { label: "AT初当たり", value: atCount !== null && gameCount > 0 ? atCount / gameCount : null, format: "fraction" },
      { label: "CZ出現（直撃除外）", value: czCount !== null && gameCount > 0 ? czCount / gameCount : null, format: "fraction" },
      { label: "柳生選択", value: czCount !== null && czCount > 0 && yagyuCount !== null ? yagyuCount / czCount : null, format: "percent" },
      { label: "抜刀チャンス", value: battoSummary.winRate, format: "percent" },
    ],
    battoSummary,
    alternativeEstimates,
    warningMessages:
      directAtCount !== null && directAtCount > 0
        ? ["直撃ATは天井やモードC周期でも起きます。設定が良い台とは限りません。AT初当たりが実際より良く出ている可能性があります。"]
        : [],
    excludedSettings: hintSummary.excludedSettings,
    referenceHintSources: hintSummary.referenceNotes,
  };
}
