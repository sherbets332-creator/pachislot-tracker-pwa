/**
 * 機種名 → 設定判別リファレンスモジュール のレジストリ。
 *
 * 機種ごとに判別基準が全く違うため、対応機種を追加するときは
 * `js/logic/settingReference/<機種キー>.js` を1つ追加してここに登録するだけでよい設計にしている。
 */
import * as sengokuOtome5 from "./sengokuOtome5.js";

/** 対応している設定判別リファレンスの一覧。 */
export const REFERENCES = [sengokuOtome5];

/** 機種名（MACHINE_NAME または MACHINE_ALIASES と完全一致）から対応リファレンスを探す。無ければnull。 */
export function getReferenceByMachineName(machineName) {
  return (
    REFERENCES.find(
      (ref) => ref.MACHINE_NAME === machineName || (ref.MACHINE_ALIASES || []).includes(machineName)
    ) || null
  );
}

/** 機種キーから対応リファレンスを探す。無ければnull。 */
export function getReferenceByKey(machineKey) {
  return REFERENCES.find((ref) => ref.MACHINE_KEY === machineKey) || null;
}
