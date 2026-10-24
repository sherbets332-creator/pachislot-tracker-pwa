# 仕様: スマスロ 獣王 設定判別ツール（手入力版）

担当: 設計・仕様=Claude / 実装=Codex / レビュー=Claude。
作業前に `AGENTS.md` を必ず読むこと（特に、`buildEstimateWithHints`、`samples` の契約、空欄と0の区別、匿名書き出し）。
手本は `js/logic/settingReference/shinuchiYoshimune.js`・`tokyoGhoul.js`・`kabaneri2.js`。既存4機種の挙動は変えない。

## 0. 範囲と最大の注意：設定は5段階（設定3が無い）
獣王の設定は **1, 2, 4, 5, 6 の5段階で、設定3は存在しない**（p-town・一撃で確認）。
今のツールは6段階前提（配列の長さ6、インデックス0=設定1）なので、**共通ロジックに「存在しない設定」を扱う仕組みを足す**。
- 機種モジュールは任意の `NONEXISTENT_SETTING_INDEXES = [2]`（インデックス。2＝設定3）を持てる。
- `estimateSettingLikelihoods(samples, { excludeIndexes = [] } = {})` を拡張: 除外インデックスは尤度0にし、残りで合計1に正規化する（除外以外の挙動は変えない）。
- `summarizeSampleContributions(samples, { excludeIndexes })` も同様に除外（判別力の比・最も出やすい設定は、存在する設定だけで計算）。
- `buildEstimateWithHints` は `reference.NONEXISTENT_SETTING_INDEXES` を上の2つへ渡す。`alternativeEstimates` があれば同様に0にする。
- 推定パネルのバー・内訳の「設定1〜6」の表示では、存在しない設定の行を**出さない**（バーに「設定3 0%」を出さない）。
- 機種モジュールの確率配列は長さ6のまま、設定3の位置は `null` を入れる（コメントで「設定3は存在しない」と明記）。
- 共通ロジックにテストを足す（除外インデックスが0になる／合計1／除外なしの既存挙動が変わらない／内訳で設定3が最も出やすいにならない）。
- 匿名書き出しの `likelihood_percent` も、設定3は0のままで構わない（`setting_labels` は6要素のまま）。

## 1. 機種モジュール
- 新規: `js/logic/settingReference/jyuuou.js`、`index.js` の `REFERENCES` に登録。
- `MACHINE_KEY = "jyuuou"`、`MACHINE_NAME = "スマスロ 獣王"`、
  `MACHINE_ALIASES = ["獣王", "Lスマスロ 獣王", "L 獣王", "L獣王", "スマスロ獣王"]`
- 契約: `ENDING_STAMPS`（空配列でよい）, `PAYOUT_OVER_HINTS`（空配列でよい）, `buildEstimate(obs)`。戻り値の形は既存機種と同じ（`samples` は `{key,label,k,n,rates}`）。

## 2. 数値表（出典: nana-press 1232/39329、p-town 5061・5454、chonborista 263920、1geki l_jyuuou、2026-10時点）
インデックス0=設定1、2=設定3（存在しない→null）。

| 要素 | 設定1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| AT「サバンナチャンス（SC）」初当たり | 1/326.5 | 1/321.6 | - | 1/295.8 | 1/287.6 | 1/279.7 |
| チャンス目直撃時のSC・BIG・REG当選率 | 0.8% | 0.8% | - | 2.3% | 2.7% | 3.1% |
| BIG中マングースが**左向き**になる割合 | 60% | 40% | - | 40% | 60% | 50% |
| 機械割 | 97.8% | - | - | - | - | 114.3% |

- AT初当たりの注釈: **「SC後の29G間を分母から除外」した値**。
- BIG中マングースの向き: 右向き＝1−左向き（40%・60%・—・60%・40%・50%）。

参考（推定に入れない。入力欄も作らない）:
- レア小役のSC高確移行率（チェリー: 3.1/3.5/-/5.5/5.9/6.3%、レアリプレイ: 20.3/21.1/-/27.3/30.9/33.6%、チャンス目: 約40%共通）。内部状態への移行率で、画面から直接数えられないため。
- 謎高確移行率（設定1が約1/1000、設定6は設定1の2倍以上。設定2・4・5は未調査）。観測できず、数値も不足。
- 設定変更後は天井が599G（通常は999G）。将来、設定変更示唆として足せる（今回はやらない）。

### 未確認の事項（推測で埋めない。コメントに残す）
- **SC初当たりの分母**。解析値は「SC後の29G間を除外」。暫定: n = `game_count` − 29 × `sc_count`（下限0）。
  マイスロの「通常ゲーム数」が、すでに29G間を除いているかは未確認。ユーザーが次の実戦でマイスロ中断データを見せて確定する。要検証と明記。
- 「チャンス目」が弱・強の合算か。暫定: ユーザーが画面の「チャンス目」回数（弱＋強）を入れる。要検証。
- マングースの向きは、BIG中に何回見えるか（1回のBIGで1回か）が未確認。暫定: 見えた回数をそのまま数える。
- 設定2・4・5の機械割は未取得（null）。
- マイスロの中断データの項目名は未確認。入力欄のラベルは仕様書のとおりにし、画面との対応は後で確定する。

## 3. 入力項目
既存の `game_count`・`total_game_count`・打-WIN欄（出さなくてよい）・ヒント欄は流用。追加フィールド（repositoryに保存、空欄＝未計測と0を区別）:
- `sc_count`: SC（サバンナチャンス）初当たり回数
- `chance_eye_count`: チャンス目の成立回数（任意）
- `chance_eye_win_count`: チャンス目からSC・BIG・REGに当選した回数（任意。`chance_eye_count` 以下。超えたら保存時にValidationError。`chance_eye_count` が空欄でこちらだけ入っていてもエラー）
- `mongoose_left_count`: BIG中のマングースが左向きだった回数（任意）
- `mongoose_right_count`: BIG中のマングースが右向きだった回数（任意）
- 空欄と0を区別する（`optionalCount` と同じやり方）。`repository.js` の「空欄を0として扱う機種」の判定に `jyuuou` を**入れない**（空欄＝未計測）。

## 4. buildEstimate
`estimateSettingLikelihoods(samples, { excludeIndexes: NONEXISTENT_SETTING_INDEXES })` で計算する。samples:
- SC初当たり（k=`sc_count`, n=`max(0, game_count − 29 × sc_count)`, rates=SC初当たり確率）。`sc_count` が空欄なら使わない。
- チャンス目直撃（k=`chance_eye_win_count`, n=`chance_eye_count`。`chance_eye_count` が0または空欄なら使わない）
- マングースの向き（k=`mongoose_left_count`, n=左+右、rates=左向き割合。設定6は50%なので差がつかないのは正常）
- 示唆は `hintMinSetting` / `excludedSettings` に反映（尤度には混ぜない）。設定6の確定示唆は共通の `applyConfirmedSetting` が拾う（`hintMinSetting` が6になる）。
- `observedMetrics`: SC初当たり（分数）、チャンス目直撃率（%）、マングース左向き割合（%）。
- `ESTIMATE_DESCRIPTION`: 設定3が存在しないことと、SCの分母が暫定であること（要検証）を書く。

## 5. 示唆
- `SETTING_HINTS`（`{value, group, label, minSetting|note}`）:
  - サミートロフィー（初回SC終了時、リール上部液晶の右側に表示）: 銅=設定2以上／金=設定4以上／キリン柄=設定5以上／虹=設定6（`minSetting: 6`）。銀は出現しない（項目を作らない）。
  - 確認方法の説明を画面に出す（`SETTING_HINT_GROUP_NOTES`）: 「初回SC終了時にリール上部の液晶右側を見る」。
- 他の示唆（BIG中マングースの向きの偶奇など）は §3 の数値要素として扱う。

## 6. テスト
- `jyuuou.test.js`（純粋関数）: 数値表の長さが6で設定3がnull／高設定寄りの入力で設定6側の尤度が上がり、**設定3は常に0**／空欄は無視・0は計算／SC初当たりの分母（29G除外）／チャンス目直撃が `chance_eye_count` 超過で弾かれる／トロフィー虹で `hintMinSetting` が6、`buildEstimateWithHints` で設定6に固定される／マングースの向き
- `settingInference.test.js`: §0 の共通ロジックのテスト
- スモークテスト: 獣王のフォーム項目が出る／推定パネルのバー・内訳に設定3が出ない／既存4機種のフォームが壊れていない／保存・再表示
- `js/dataTransfer.js` はストア追加が無いので変更不要（確認はする）
- `npm test` 全通過後にcommit。`git status` で個人データの混入が無いか確認。**pushはしない**（Claudeがレビュー後にpushする）。

## 7. レビュー観点（Claude）
- 数値表が出典と一致／未確認事項（SCの分母・チャンス目の定義）がコメントに残っているか
- 設定3が、バー・内訳・匿名書き出し・一言サマリーのどこにも出てこないか
- 既存4機種の挙動が変わっていないか、空欄と0の区別
