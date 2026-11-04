# Draws the Bytepet app icon (assets/icon.png, 1024x1024): an original pixel handheld with the pet on its LCD.
# Run: node scripts/sprite-dump.js | python3 scripts/make-icon.py
import json, sys
from PIL import Image, ImageDraw

data = json.load(sys.stdin)
S = 1024
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
INK = (31, 42, 26, 255)
SHELL = (232, 226, 208, 255)
SHELL_DARK = (200, 192, 170, 255)
LCD = (207, 221, 175, 255)

# macOS icon grid: ~824px body centred
d.rounded_rectangle((100, 100, 924, 924), radius=190, fill=INK)
d.rounded_rectangle((124, 124, 900, 900), radius=170, fill=SHELL)
d.line((180, 740, 844, 740), fill=SHELL_DARK, width=10)
# screen
d.rounded_rectangle((210, 200, 814, 700), radius=40, fill=INK)
d.rectangle((240, 230, 784, 670), fill=LCD)
# pet
grid, pal = data['grid'], data['palette']
cell = 18
ox = 512 - grid * cell // 2
oy = 450 - grid * cell // 2
def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
for key, c in data['px']:
    x, y = map(int, key.split(','))
    if 0 <= x < grid and 0 <= y < grid:
        d.rectangle((ox + x * cell, oy + y * cell, ox + (x + 1) * cell - 1, oy + (y + 1) * cell - 1), fill=hexc(pal.get(c, pal['o'])))
# three round buttons
for cx in (372, 512, 652):
    d.ellipse((cx - 44, 772, cx + 44, 860), fill=INK)
    d.ellipse((cx - 32, 780, cx + 32, 844), fill=(120, 132, 96, 255))
img.save('assets/icon.png')
print('wrote assets/icon.png')
