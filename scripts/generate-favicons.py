#!/usr/bin/env python3
"""Generate the classic favicon set (ico/16/32/apple-touch/png) from a single square icon.png.

Usage: python3 ../hexatech-shared/scripts/generate-favicons.py assets/icon.png client/public
"""
import sys
from PIL import Image

def main():
    src_path, out_dir = sys.argv[1], sys.argv[2]
    src = Image.open(src_path)
    mode = "RGBA" if src.mode in ("RGBA", "LA") or "transparency" in src.info else "RGB"
    img = src.convert(mode)

    sizes = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "favicon.png": 192,
        "apple-touch-icon.png": 180,
    }
    for name, size in sizes.items():
        img.resize((size, size), Image.LANCZOS).save(f"{out_dir}/{name}")
        print(f"wrote {out_dir}/{name} ({size}x{size})")

    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    img.save(f"{out_dir}/favicon.ico", sizes=ico_sizes)
    print(f"wrote {out_dir}/favicon.ico ({ico_sizes})")

if __name__ == "__main__":
    main()
