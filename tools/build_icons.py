"""Writes the app icons into assets/icon/: three SVGs from one drawing, then PNGs rendered with
macOS's qlmanage and sips, and the 1200x630 share card for link previews. Rerun after changing the
drawing: python3 tools/build_icons.py"""
import subprocess
import tempfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'icon'
BG = '#2B1B14'

# An upright guitar, body centered on the origin's x axis, from the headstock (y -250) to the
# bottom of the body (y 260). Each variant tilts and scales it.
GUITAR = '''
<defs>
  <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#E8B26B"/>
    <stop offset="1" stop-color="#C07A36"/>
  </linearGradient>
</defs>
<rect x="-20" y="-252" width="40" height="66" rx="10" fill="#8E5A2C"/>
<circle cx="-9" cy="-236" r="3.5" fill="#F1E9DC"/><circle cx="9" cy="-236" r="3.5" fill="#F1E9DC"/>
<circle cx="-9" cy="-218" r="3.5" fill="#F1E9DC"/><circle cx="9" cy="-218" r="3.5" fill="#F1E9DC"/>
<circle cx="-9" cy="-200" r="3.5" fill="#F1E9DC"/><circle cx="9" cy="-200" r="3.5" fill="#F1E9DC"/>
<rect x="-14" y="-190" width="28" height="200" fill="#8E5A2C"/>
<path fill="url(#wood)" d="M0 0C45 0 78 25 78 58C78 88 60 98 60 118C60 138 100 145 100 190C100 235 55 260 0 260C-55 260 -100 235 -100 190C-100 145 -60 138 -60 118C-60 98 -78 88 -78 58C-78 25 -45 0 0 0Z"/>
<circle cx="0" cy="105" r="37" fill="none" stroke="#F1E9DC" stroke-width="5"/>
<circle cx="0" cy="105" r="29" fill="#1E1612"/>
<rect x="-34" y="196" width="68" height="14" rx="7" fill="#1E1612"/>
<g stroke="#F1E9DC" stroke-width="2.2" stroke-linecap="round">
  <line x1="-10" y1="-190" x2="-10" y2="203"/><line x1="-6" y1="-190" x2="-6" y2="203"/>
  <line x1="-2" y1="-190" x2="-2" y2="203"/><line x1="2" y1="-190" x2="2" y2="203"/>
  <line x1="6" y1="-190" x2="6" y2="203"/><line x1="10" y1="-190" x2="10" y2="203"/>
</g>
'''


def svg(scale, background):
    bg = f'<rect width="512" height="512" fill="{background}"/>' if background else ''
    # Chrome rasterizes a manifest SVG icon at its intrinsic size, so it needs width and height.
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">{bg}'
            f'<g transform="translate(256 256) rotate(40) scale({scale}) translate(0 -5)">{GUITAR}</g></svg>\n')


VARIANTS = {
    'icon.svg': svg(0.82, BG),            # home screens that keep the square or round the corners
    'icon-maskable.svg': svg(0.66, BG),   # Android crops to a circle: art inside the central 80%
    'favicon.svg': svg(0.95, None),       # browser tab, transparent
}
# The share card. qlmanage renders a square, so the card is drawn in the middle 630 rows of a
# 1200x1200 square and cropped; drawn at 1200x630 it would come back padded with white.
SHARE = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">
<rect width="1200" height="1200" fill="{BG}"/>
<g transform="translate(290 600) rotate(40) scale(1.0) translate(0 -5)">{GUITAR}</g>
<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
<text x="540" y="578" font-size="76" font-weight="700" fill="#F1E9DC">Guitar Simulator</text>
<text x="542" y="640" font-size="36" fill="#E8B26B">A classical guitar in your browser</text>
<text x="542" y="696" font-size="28" fill="#F1E9DC" fill-opacity="0.75">Tabs, playback and example songs. Free.</text>
</g></svg>
'''

PNGS = [('icon.svg', 'icon-192.png', 192), ('icon.svg', 'icon-512.png', 512),
        ('icon.svg', 'apple-touch-icon.png', 180), ('icon-maskable.svg', 'icon-maskable-512.png', 512),
        ('favicon.svg', 'favicon-32.png', 32)]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, text in VARIANTS.items():
        (OUT / name).write_text(text)
    with tempfile.TemporaryDirectory() as tmp:
        for src in VARIANTS:
            subprocess.run(['qlmanage', '-t', '-s', '1024', '-o', tmp, str(OUT / src)],
                           check=True, capture_output=True)
        for src, png, size in PNGS:
            subprocess.run(['sips', '-Z', str(size), f'{tmp}/{src}.png', '--out', str(OUT / png)],
                           check=True, capture_output=True)
        card = Path(tmp) / 'share.svg'
        card.write_text(SHARE)
        subprocess.run(['qlmanage', '-t', '-s', '1200', '-o', tmp, str(card)], check=True, capture_output=True)
        subprocess.run(['sips', '--cropToHeightWidth', '630', '1200', f'{tmp}/share.svg.png', '--out', str(OUT / 'share.png')],
                       check=True, capture_output=True)


if __name__ == '__main__':
    main()
