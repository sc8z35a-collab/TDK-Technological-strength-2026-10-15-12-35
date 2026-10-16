"""Converts the generated map textures to lossless WebP for the bundle.

The PNGs in src/assets are the masters written by gen-land.mjs / gen-japan.mjs.
Lossless WebP keeps every channel bit-exact (R = land mask, G = relief,
B = shelf) at about 60% of the size. Requires Pillow:
    python3 scripts/to-webp.py
"""
import os
from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets')
for name in ('land', 'japan'):
    src = os.path.join(root, name + '.png')
    dst = os.path.join(root, name + '.webp')
    im = Image.open(src).convert('RGB')
    im.save(dst, lossless=True, quality=100, method=6)
    back = Image.open(dst).convert('RGB')
    assert back.tobytes() == im.tobytes(), name + ': not lossless'
    print(f'{name}.webp {os.path.getsize(dst) // 1024} KB (png {os.path.getsize(src) // 1024} KB)')
