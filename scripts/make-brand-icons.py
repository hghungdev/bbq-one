"""
U25: xuất icon BBQOne "cắt sát" từ bản gốc design/transparent/icon1024.png.

Bản gốc có viền trong suốt rộng (hình chỉ chiếm ~86% ngang, ~76% dọc) → ở 16 px trên thanh công cụ Chrome và
28 px trên header, logo nhỏ hơn hẳn các icon khác (vốn lấp gần kín khung). Script cắt theo vùng có hình (alpha > 0),
chừa lề MARGIN mỗi bên, đặt giữa khung vuông rồi thu nhỏ (Lanczos).

Chạy (cần Pillow: pip install pillow):   python scripts/make-brand-icons.py

U26: hình rộng hơn cao (~888 × 782) → ở 16 px chỉ 16 × 14. Riêng icon Chrome cắt bớt CHROME_TRIM phần ngang dư
(hai cánh xòe hai bên) để lấp gần kín chiều dọc; logo header giữ nguyên dáng (đủ chỗ).

Ghi ra:
  design/transparent-tight/icon{16,32,48,128}.png  (icon Chrome — đã cắt cánh)  → public/icon-{16,32,48,128}.png
  design/transparent-tight/logo{32,64}.png         (logo header — không cắt)     → src/assets/brand/bbqone-logo-32.png (1x),
                                                                                    src/assets/brand/bbqone-logo.png (2x)
"""

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "design" / "transparent" / "icon1024.png"
OUT_DIR = ROOT / "design" / "transparent-tight"
CHROME_SIZES = (16, 32, 48, 128)
LOGO_SIZES = (32, 64)
# Lề mỗi bên (tỉ lệ cạnh khung) — đủ để mép khử răng cưa không bị cắt, vẫn lấp gần kín như icon Google.
MARGIN = 0.015
# Phần ngang dư (rộng − cao) bỏ đi ở icon Chrome: 0 = giữ nguyên, 1 = cắt vuông hẳn (mất dáng xòe).
CHROME_TRIM = 0.5


def tight_master(trim: float) -> Image.Image:
    src = Image.open(SOURCE).convert("RGBA")
    art = src.crop(src.getchannel("A").getbbox())
    cut = round(max(art.width - art.height, 0) * trim / 2)
    art = art.crop((cut, 0, art.width - cut, art.height))
    side = round(max(art.size) * (1 + 2 * MARGIN))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)
    return canvas


def export(master: Image.Image, size: int) -> Image.Image:
    icon = master.resize((size, size), Image.LANCZOS)
    # Cỡ nhỏ: làm nét nhẹ sau khi thu nhỏ để chữ "One" và mép không nhòe.
    if size <= 32:
        icon = icon.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=0))
    return icon


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    chrome = tight_master(CHROME_TRIM)
    for size in CHROME_SIZES:
        icon = export(chrome, size)
        icon.save(OUT_DIR / f"icon{size}.png", optimize=True)
        icon.save(ROOT / "public" / f"icon-{size}.png", optimize=True)
    logo = tight_master(0)
    brand = ROOT / "src" / "assets" / "brand"
    brand.mkdir(parents=True, exist_ok=True)
    for size in LOGO_SIZES:
        icon = export(logo, size)
        icon.save(OUT_DIR / f"logo{size}.png", optimize=True)
    export(logo, 32).save(brand / "bbqone-logo-32.png", optimize=True)
    export(logo, 64).save(brand / "bbqone-logo.png", optimize=True)
    print(f"[make-brand-icons] {SOURCE.name} → {OUT_DIR.relative_to(ROOT)}, public/icon-*, src/assets/brand")


if __name__ == "__main__":
    main()
