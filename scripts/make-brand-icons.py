"""
U25: xuất icon BBQOne "cắt sát" từ bản gốc design/transparent/icon1024.png.

Bản gốc có viền trong suốt rộng (hình chỉ chiếm ~86% ngang, ~76% dọc) → ở 16 px trên thanh công cụ Chrome và
28 px trên header, logo nhỏ hơn hẳn các icon khác (vốn lấp gần kín khung). Script cắt theo vùng có hình (alpha > 0),
chừa lề MARGIN mỗi bên, đặt giữa khung vuông rồi thu nhỏ (Lanczos).

Chạy (cần Pillow: pip install pillow):   python scripts/make-brand-icons.py

Ghi ra:
  design/transparent-tight/icon{16,32,48,64,128}.png   (nguồn đã cắt sát — commit cùng repo)
  public/icon-{16,32,48,128}.png                        (icon Chrome — manifest)
  src/assets/brand/bbqone-logo.png                      (logo header = bản 64 px)
"""

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "design" / "transparent" / "icon1024.png"
OUT_DIR = ROOT / "design" / "transparent-tight"
SIZES = (16, 32, 48, 64, 128)
# Lề mỗi bên (tỉ lệ cạnh khung) — đủ để mép khử răng cưa không bị cắt, vẫn lấp gần kín như icon Google.
MARGIN = 0.015


def tight_master() -> Image.Image:
    src = Image.open(SOURCE).convert("RGBA")
    art = src.crop(src.getchannel("A").getbbox())
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
    master = tight_master()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        icon = export(master, size)
        icon.save(OUT_DIR / f"icon{size}.png", optimize=True)
        if size != 64:
            icon.save(ROOT / "public" / f"icon-{size}.png", optimize=True)
    (ROOT / "src" / "assets" / "brand").mkdir(parents=True, exist_ok=True)
    export(master, 64).save(ROOT / "src" / "assets" / "brand" / "bbqone-logo.png", optimize=True)
    print(f"[make-brand-icons] {SOURCE.name} → {OUT_DIR.relative_to(ROOT)}, public/icon-*, src/assets/brand")


if __name__ == "__main__":
    main()
