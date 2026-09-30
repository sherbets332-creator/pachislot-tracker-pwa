/**
 * QRコード読み取り（カメラで撮影した画像から、jsQRでデコードする）。
 *
 * jsQR本体は js/vendor/jsQR.js に同梱している（外部CDN不使用、オフラインで動く）。ファイルが
 * そこそこ大きい（約250KB）ため、アプリ起動時には読み込まず、実際にQR読み取りを使う画面で
 * 初めて動的に<script>タグを差し込んで読み込む（ensureJsQRLoaded）。
 *
 * canvas・Image・createImageBitmapを使う部分（decodeQrFromImageFile）はブラウザ専用のため、
 * jsdomでは自動テストしていない（js/ui/simpleChart.jsと同じ扱い）。ImageDataを受け取ってからの
 * デコード部分（decodeQrFromImageData）だけは window.jsQR をスタブすれば単体テストできる。
 */

let loadPromise = null;

/** js/vendor/jsQR.js を1回だけ読み込み、window.jsQR を使えるようにする。 */
function ensureJsQRLoaded() {
  if (window.jsQR) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("../vendor/jsQR.js", import.meta.url).href;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null; // 失敗したら次回また読み込みを試せるようにする
      reject(new Error("QR読み取り機能の読み込みに失敗しました。"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * ImageDataからQRコードをデコードする（jsQR本体への薄いラッパー）。
 * @returns {string|null} 読み取れた文字列。読み取れなければnull。
 */
export function decodeQrFromImageData(imageData) {
  if (!window.jsQR) throw new Error("QR読み取り機能が読み込まれていません。");
  const result = window.jsQR(imageData.data, imageData.width, imageData.height);
  return result ? result.data : null;
}

function loadImageBitmapLike(file) {
  if (window.createImageBitmap) {
    return window.createImageBitmap(file);
  }
  // createImageBitmapが無い環境向けのフォールバック（古いSafari等）。
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * カメラ等で撮影した画像ファイル(File/Blob)からQRコードを読み取り、デコードされた文字列を返す。
 * @returns {Promise<string|null>} 読み取れなければnull。
 */
export async function decodeQrFromImageFile(file) {
  await ensureJsQRLoaded();
  const bitmap = await loadImageBitmapLike(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close(); // ImageBitmapはメモリ解放が必要
  return decodeQrFromImageData(imageData);
}
