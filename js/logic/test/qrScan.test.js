/**
 * QRコードのデコード部分（js/ui/qrScan.js のdecodeQrFromImageData）のテスト。
 * canvas・Image等を使う画像読み込み部分（decodeQrFromImageFile）はブラウザ専用のため対象外
 * （js/ui/simpleChart.jsと同じ扱い。手動確認のみ）。
 *
 * 実行: node js/logic/test/qrScan.test.js
 */
import assert from "node:assert/strict";

global.window = global.window || {};
const { decodeQrFromImageData } = await import("../../ui/qrScan.js");

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`OK   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const fakeImageData = { data: new Uint8ClampedArray(), width: 1, height: 1 };

test("decodeQrFromImageData: window.jsQRが読み取れた文字列をそのまま返す", () => {
  window.jsQR = () => ({ data: "https://dwlite.heiwa.jp/ps/41/abc" });
  assert.equal(decodeQrFromImageData(fakeImageData), "https://dwlite.heiwa.jp/ps/41/abc");
});

test("decodeQrFromImageData: 読み取れなければnullを返す", () => {
  window.jsQR = () => null;
  assert.equal(decodeQrFromImageData(fakeImageData), null);
});

test("decodeQrFromImageData: jsQRが読み込まれていなければエラーになる", () => {
  delete window.jsQR;
  assert.throws(() => decodeQrFromImageData(fakeImageData));
});

console.log(`\n${passCount} 件成功`);
