"""外部ライブラリ（Pillow等）を使わず、標準ライブラリのzlibだけでPWA用アイコン（PNG）を生成する。

背景を単色（アプリのテーマカラー）にし、中央に白い円と「€」ならぬスロット風のシンプルな
図形（縦3本のリール風の線）を描く、簡易的なアイコン。開発用の一時的な見た目でよく、
後で差し替えても構わない。

実行: python scripts/generate_icons.py
"""
import struct
import zlib
from pathlib import Path

BG = (13, 110, 253)  # #0d6efd（アプリのテーマカラー）
WHITE = (255, 255, 255)


def make_png(size: int, path: Path) -> None:
    pixels = bytearray()
    cx = cy = size / 2
    radius = size * 0.42
    reel_w = size * 0.10
    reel_gap = size * 0.06
    reel_h = size * 0.5
    reel_y0 = cy - reel_h / 2
    reel_y1 = cy + reel_h / 2
    reel_xs = [cx - reel_gap - reel_w, cx - reel_w / 2, cx + reel_gap]

    for y in range(size):
        pixels.append(0)  # フィルタタイプ: none
        for x in range(size):
            dx, dy = x - cx, y - cy
            in_circle = (dx * dx + dy * dy) ** 0.5 <= radius
            in_reel = False
            if reel_y0 <= y <= reel_y1:
                for rx in reel_xs:
                    if rx <= x <= rx + reel_w:
                        in_reel = True
                        break
            if in_circle and not in_reel:
                r, g, b = WHITE
            else:
                r, g, b = BG
            pixels += bytes((r, g, b, 255))

    raw = bytes(pixels)
    compressed = zlib.compress(raw, 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # bit depth8, color type6(RGBA)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"wrote {path} ({size}x{size}, {len(png)} bytes)")


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent.parent / "icons"
    out_dir.mkdir(exist_ok=True)
    for size in (192, 512, 180):  # 180 = apple-touch-icon 推奨サイズ
        make_png(size, out_dir / f"icon-{size}.png")
