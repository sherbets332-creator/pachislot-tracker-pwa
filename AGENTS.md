# AGENTS.md

このリポジトリは、複数のAIコーディングツール(Claude / MulmoClaude、Codex CLI など)から
並行して触られることがあります。作業を始める前に必ずこのファイルを読んでください。

## プロジェクト概要

パチスロの収支・貯玉を記録する個人用アプリ。iPhoneのSafariで完結させる(サーバー不要)ことが
最大の目的で、データはブラウザのIndexedDBだけに保存する。姉妹プロジェクトとして
Flask+SQLite版(`../pachislot-tracker`)が別リポジトリにあり、そちらは動作確認済みの
仕様書・バックアップ扱い。**このロジックはFlask版を正として移植したもの**なので、
計算結果に疑問があればFlask版の該当サービス（`app/services/`）を確認すること。

GitHub Pages（https://sherbets332-creator.github.io/pachislot-tracker-pwa/ ）で公開済み。
mainブランチにpushすると自動で再デプロイされる。

## 絶対に守ってほしい設計ルール

- **ビルド不要のバニラJavaScript(ESモジュール)。npm/バンドラーは本番コードに一切使わない**。
  `devDependencies`（fake-indexeddb, jsdom）はテスト専用で、本番のPWAには含まれない
- **外部CDNへの依存を作らない**（Bootstrap・Chart.js等を安易に追加しない）。オフラインで
  初回起動できなくなるとPWAとして意味がなくなるため。グラフは`js/ui/simpleChart.js`の自前SVG
- 層構造を守る: `js/logic/`（DB非依存の純粋関数）→ `js/db.js`（IndexedDBの薄いCRUD）→
  `js/repository.js`（実際のアプリ操作、Flask版のroutesに相当）→ `js/views/`（画面）→ `js/app.js`（ルーティング）
- `record_realization_adjustments`に相当するテーブルは**保存しない**。表示のたびに
  `js/logic/savedBallRealization.js`でFIFO計算をその場でやり直す設計（Flask版との一番の違い）
- 金額計算には`js/logic/numberUtils.js`の`pyRound`を使うこと。JSの`Math.round()`は
  `.5`を必ず切り上げるため、Pythonの`round()`（銀行丸め）と結果がズレることがある
- `listShops`/`listMachines`の`includeArchived`は「アーカイブ済み**だけ**返す」トグルであって
  「全部含める」フラグではない（一覧画面のアーカイブ表示切り替え用）。全件（アーカイブ問わず）
  欲しい場合は`listAllShops`/`listAllMachines`を使うこと（過去に取り違えてバグを出した実績あり）
- 設定判別ツール（`js/logic/settingReference/`）は機種ごとに判別基準が全く違うため、
  対応機種を追加するときは既存ファイル（`sengokuOtome5.js`）をコピーして新しい機種キーのファイルを
  1つ追加し、`settingReference/index.js`の`REFERENCES`配列に登録するだけでよい設計にしている。
  各機種モジュールは`MACHINE_KEY`・`MACHINE_NAME`・`ENDING_STAMPS`・`PAYOUT_OVER_HINTS`・
  `buildEstimate(obs)`（同じ引数形・戻り値形）を持つ契約を守ること（`settingObservationFormView.js`が
  この契約に依存している）。戦国乙女5では`summarizePeriodLog`・`summarizeMikoLog`（周期メモ・巫女メモ、
  現状フォームは必須として呼んでいるので2機種目追加時は要対応）と、任意の`STRAP_MODES`・`SETTING_HINTS`
  （無ければフォームはそのカードを出さない）も持っている。
  機種名は`getReferenceByMachineName`で`MACHINE_NAME`または`MACHINE_ALIASES`との**完全一致**判定なので、
  対応機種は機種マスタにその名前どおりに登録してもらう必要がある

## 開発・テストの進め方

- `npm test`を実行してから commit する（`js/logic/test/*.test.js` と `*.smoke.test.js`。
  fake-indexeddbでIndexedDB、jsdomでDOMを再現してテストしている。全スイート通ることを確認すること）
- 新しい画面・関数を追加したら、対応する`*.smoke.test.js`にもテストを追加する
- **この開発環境（Windows）ではnpm installが依存解決はできるのにnode_modulesへの実展開だけ
  無言で失敗することがある**（原因: Node の execSync が Windows で既定で cmd.exe を使うこととの
  組み合わせ）。`npm install`後に`node_modules`が実際にできているか確認し、できていなければ
  `node scripts/extract-node-modules.js`（package-lock.jsonから直接tarballを展開する）を使う

## Git運用（重要・過去にインシデントあり）

- **`git add -A`する前に必ず`git status`で中身を確認すること**。過去に、ユーザーの実データを
  含むエクスポートJSONファイルが誤って1コミットに混入し、Public リポジトリにpushされてしまった
  インシデントがあった（force push + amendで復旧、GitHubサポートにも完全パージを依頼済み）
- 個人データ(実店舗名、実際の収支記録など)を**絶対にcommitしない**。エクスポート機能で
  生成される`pachislot-export-*.json`は`.gitignore`済み
- commitの作者メールは、このリポジトリでは最初からGitHubのnoreplyアドレス
  （`332745177+sherbets332-creator@users.noreply.github.com`）を使っている。変更しないこと
- Claude/MulmoClaude経由でcommitする場合は、コミットメッセージの最後に
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` を付ける(セッション側の指示による)。
  Codex経由の場合はCodex自身の規約に従ってよい
- リポジトリはPublic（GitHub Pagesを無料枠で使うため）。公開して問題ないことを常に意識する

## ディレクトリ構成

```
index.html          エントリポイント（<script type="module" src="js/app.js">）
css/app.css         自前CSS（外部CDN不使用）
js/logic/           DB非依存の純粋関数（profitCalculator, savedBallLedger, savedBallRealization, validation, numberUtils, settingInference）
js/logic/settingReference/  機種ごとの設定判別理論値・推定関数（機種を追加するときはここに1ファイル追加）
js/logic/test/      npm testで実行される全テスト
js/db.js            IndexedDBの6ストア（shops/machines/records/saved_ball_transactions/shop_machines/setting_observations）＋汎用CRUD
js/repository.js    実際のアプリ操作（Flask版routesに相当）
js/views/           画面ごとのレンダリング関数
js/router.js        ハッシュルーター
js/app.js           ルート定義・DB初期化・Service Worker登録
js/dataTransfer.js  エクスポート/インポート
js/ui/              フォーマット・フラッシュメッセージ・SVGチャート
sw.js, manifest.json, icons/   PWA対応（オフライン・ホーム画面追加）
scripts/            開発用スクリプト（generate_icons.py, extract-node-modules.js, scrape_pworld.js）
```
