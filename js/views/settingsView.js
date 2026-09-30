/**
 * 「その他」画面：データのエクスポート／インポート（手動バックアップ・移行・端末間同期）。
 */
import { exportAllData, importAllData, buildExportFilename, ImportError } from "../dataTransfer.js";
import { renderFlash, setFlash } from "../ui/flash.js";
import { navigate, buildUrl } from "../router.js";

export async function renderSettings(container, db) {
  container.innerHTML = `
    ${renderFlash()}
    <h1>その他</h1>

    <div class="card">
      <h2 style="margin-top:0;">設定判別ツール</h2>
      <p class="small muted">
        対応機種（現在は「L戦国乙女5 業火を穿つ宿焔の双刃」のみ）で、遊技中に数えたデータから設定の目安を参考表示します。
      </p>
      <a class="btn btn-primary btn-block" href="${buildUrl("/setting-tool")}">設定判別ツールを開く</a>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">データのバックアップ・移行</h2>
      <p class="small muted">
        このアプリのデータは、この端末のブラウザ内だけに保存されています（サーバーはありません）。
        ファイルに書き出しておけば、機種変更時の引き継ぎや、他の端末（PCなど）との
        手動での同期に使えます。
      </p>

      <div class="mb-3">
        <button type="button" class="btn btn-primary btn-block" id="export-btn">データをエクスポート（ファイルに保存）</button>
      </div>

      <div class="field">
        <label>データを読み込む（インポート）</label>
        <input type="file" id="import-file" accept="application/json,.json">
        <div class="hint" style="color:#dc3545;">
          読み込むと、今この端末にあるデータは全て置き換わります。元には戻せないので、
          必要であれば先に「エクスポート」で今のデータを保存しておいてください。
        </div>
      </div>
      <div id="import-status"></div>
    </div>
  `;

  container.querySelector("#export-btn").addEventListener("click", async () => {
    const data = await exportAllData(db);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildExportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const fileInput = container.querySelector("#import-file");
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm("この端末にあるデータは全て置き換わります。よろしいですか？")) {
      fileInput.value = "";
      return;
    }
    const statusEl = container.querySelector("#import-status");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAllData(db, data);
      setFlash("データを読み込みました。");
      navigate("/calendar");
    } catch (err) {
      const message = err instanceof ImportError || err instanceof SyntaxError
        ? `読み込めませんでした：${err.message}`
        : `読み込み中にエラーが発生しました：${err.message}`;
      statusEl.innerHTML = `<div class="alert alert-danger">${message}</div>`;
    } finally {
      fileInput.value = "";
    }
  });
}
