# パチスロ収支管理 PWA版

iPhone(Safari)単体で完結させる版。サーバー不要、データはブラウザのIndexedDBに保存する。

姉妹プロジェクト:[pachislot-tracker](https://github.com/sherbets332-creator/pachislot-tracker)（Flask+SQLite版）。
そちらは動作確認済みの仕様書・バックアップとして残してあり、このPWA版のロジックは
そちらの実装を正として移植している。

## 設計方針

- ビルド不要のバニラJavaScript（ES Modules）。npmのビルドツールは使わない
- データはIndexedDB（店舗・機種・記録・貯玉台帳の4ストア。実現差額調整は保存せず、
  表示のたびにその場でFIFO計算をやり直して導出する）
- GitHub Pagesで公開し、iPhoneのSafariで「ホーム画面に追加」して使う
- Flask版のDBからのデータ移行、PWA↔PC間の手動エクスポート/インポートに対応予定

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
- ⬜ 画面（カレンダー・記録入力・店舗/機種マスタ・収支分析）：未着手
- ⬜ Service Worker・manifest.json（オフライン対応・ホーム画面追加）：未着手
- ⬜ Flask版DBからのデータ移行スクリプト：未着手
- ⬜ PC↔PWA間の手動エクスポート/インポート機能：未着手

## テストの実行方法

Node.js（開発時のみ使用。本番のPWA自体はNode不要でSafariだけで動く）：

```
npm install
npm test
```
