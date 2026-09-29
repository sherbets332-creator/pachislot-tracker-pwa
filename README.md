# パチスロ収支管理 PWA版

iPhone(Safari)単体で完結させる版。サーバー不要、データはブラウザのIndexedDBに保存する。

姉妹プロジェクト:[pachislot-tracker](https://github.com/sherbets332-creator/pachislot-tracker)（Flask+SQLite版）。
そちらは動作確認済みの仕様書・バックアップとして残してあり、このPWA版のロジックは
そちらの実装を正として移植している。

## 設計方針

- ビルド不要のバニラJavaScript（ES Modules）。npmのビルドツールは使わない
- データはIndexedDB（店舗・機種・記録・貯玉台帳の4ストア。実現差額調整は保存せず、
  表示のたびにその場でFIFO計算をやり直して導出する）
- GitHub Pagesで公開し、iPhoneのSafariで「ホーム画面に追加」して使う（公開はまだ）
- Flask版のDBからのデータ移行、PWA↔PC間の手動エクスポート/インポートに対応済み

## 現状の実装状況

- ✅ コアロジックの移植（`js/logic/`）：収支計算・貯玉台帳の残高計算・貯玉換金のFIFOロット会計/
  実現差額調整・入力バリデーション（残高マイナス化防止など）
  - Node.jsで単体テスト済み（`js/logic/test/logic.test.js`）。Flask版と同じシナリオで
    完全に同じ計算結果になることを確認済み
- ✅ IndexedDB層（`js/db.js`）：4オブジェクトストア（shops/machines/records/saved_ball_transactions）と汎用CRUD。fake-indexeddb（開発時のみ）でNode上からテスト済み
- ✅ リポジトリ層（`js/repository.js`）：Flask版のroutes（records/shops/machines）に相当する実際の操作
  （記録の作成・編集・削除、店舗・機種マスタのCRUD・アーカイブ・削除、貯玉換金・残高調整の作成・編集・削除、
  表示用収支の計算）。Flask版で検証済みの全シナリオ（残高不足チェック・FIFO実現差額・獲得数超過チェック・
  編集/削除時の連鎖チェック）を同じ結果になることを確認済み
- ✅ 画面：カレンダー・日別記録一覧・記録の新規登録/編集フォーム・店舗一覧/詳細/登録編集・
  貯玉換金/残高調整フォーム・機種一覧/登録編集・収支分析（年別/月別/機種別/店舗別集計＋
  月別収支・累計収支・貯玉残高推移グラフ）まで実装済み
  （`index.html` + `js/router.js`（ハッシュルーター）+ `js/app.js` + `js/views/`）。
  外部CDNには一切依存しない自前CSS・自前SVGチャート（`css/app.css`, `js/ui/simpleChart.js`。
  Chart.jsは使わない）。jsdom（開発時のみ）でフォーム送信・削除ボタン・アーカイブ・
  FIFO実現差額の表示・グラフ描画・バリデーションエラー表示までDOM上で検証済み
- ✅ Service Worker・manifest.json（オフライン対応・ホーム画面追加）：`sw.js`はキャッシュ一覧を
  手書きで維持しなくて済むよう stale-while-revalidate 方式（キャッシュがあれば即返しつつ裏で
  更新、初回だけオンライン必須）。`manifest.json`＋iOS用のApple独自metaタグ（apple-touch-icon等）
  も追加。アイコンはPillow等を使わず標準ライブラリzlibだけで生成（`scripts/generate_icons.py`）
- ✅ データのエクスポート/インポート（「その他」画面、`js/dataTransfer.js`）：JSONファイルへの
  書き出し・読み込み（読み込みは全置き換え、要確認）。Flask版の`scripts/export_for_pwa.py`が
  同じ形式で書き出すので、そのままインポートできる。実際のFlask版本番DB（17記録・25取引）で
  往復させ、貯玉残高・全期間収支合計ともFlask版の実際の値と完全一致することを確認済み
- ✅ GitHubへのpush・GitHub Pagesでの公開：完了（Public、
  https://github.com/sherbets332-creator/pachislot-tracker-pwa 、
  https://sherbets332-creator.github.io/pachislot-tracker-pwa/ ）
- ✅ 記録の検索・フィルター画面（`js/views/recordsListView.js`、`repository.searchRecords`）：
  店舗・機種・期間で絞り込んで一覧表示。収支分析ページの機種別/店舗別の行からも
  絞り込み済みの状態でここへ遷移できる
- ✅ 貯玉使用のお得サマリー（店舗詳細ページ、Codexが実装）：貸出レート換算と換金レート換算の
  差額から「貯玉N枚使ってX円得しました」を集計表示

## テストの実行方法

Node.js（開発時のみ使用。本番のPWA自体はNode不要でSafariだけで動く）：

```
npm install
npm test
```

ローカルで実際に画面を確認する場合（ESモジュールを使っているため `file://` では
読み込めないブラウザがある。簡易サーバー経由で開く）：

```
python -m http.server 8765
# http://localhost:8765/ をブラウザで開く
```

### 補足：この開発環境でのnpm installについて

このプロジェクトを作った開発環境では、`npm install`が依存関係の解決（package-lock.json
の作成）はできるのに、実際のファイル展開（node_modulesへのtarball展開）だけが
無言で失敗するという問題があった（原因はNode.jsの`execSync`がWindowsで既定で
`cmd.exe`を使うことと、スコープ付きパッケージ名を含む絶対パスの受け渡しに起因する
組み合わせ問題）。もし同じ症状（`npm install`は成功と表示されるのに`node_modules`が
できない）が起きたら、`node scripts/extract-node-modules.js`を実行すると
package-lock.jsonの内容から直接tarballをダウンロード＆展開できる。
