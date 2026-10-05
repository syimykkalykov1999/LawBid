#!/usr/bin/env python3
"""Generates the LawBid app launcher icon (iOS + Android) from scratch.

2026-09-22 owner request: the app icon should be the same scales-of-justice
mark used inside the app (see lib/core/design_system/widgets/display/
scales_logo.dart), with the same "Law"/"Bid" pan inscriptions -- not a
separate design. This script is a from-scratch Python/Pillow re-drawing of
that CustomPainter's geometry (static angle=0 pose), scaled into the icon.

2026-10-05 owner request: on Android the icon showed as a small square
navy tile inside the launcher's rounded shape, and the scales were small
and thin. So Android now gets a real ADAPTIVE icon (API 26+, which is our
minSdk): a navy background layer + a transparent foreground layer with the
scales, plus a monochrome layer for themed icons. The launcher masks the
whole 108dp canvas into its own shape (circle, squircle...), so the navy
fills the shape edge to edge like every other app. The scales are sized to
the 66dp safe zone and drawn with icon-weight strokes (thicker than the
in-app 2.6) so they stay crisp at 48dp.

Every bitmap is drawn at 4x and downsampled, from vector geometry, at the
exact pixel size of each density -- no upscaling of a small master.

Run from apps/mobile/:
    python3 tool/generate_app_icon.py
Requires Pillow (`pip install Pillow`). The pan inscriptions use the app's
own bundled serif, assets/fonts/SourceSerif4-Variable.ttf.
"""

import math
import os

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "assets/fonts/SourceSerif4-Variable.ttf"

BG = (10, 26, 63)          # #0A1A3F -- AppColorsDark navy
LINE = (212, 175, 90)      # #D4AF5A -- AppColorsDark.goldStroke
PAN_FILL = (255, 255, 255)  # #FFFFFF -- AppColorsDark.panFill
PAN_TEXT = (10, 26, 63)    # #0A1A3F -- AppColorsDark.panText
WHITE = (255, 255, 255)

# Icon-weight strokes in the 300x212 design space (in-app widget: 2.6/1.6).
STROKE = 6.0
PAN_STROKE = 4.0
FONT_SIZE = 25
FONT_WEIGHT = 700

# Visual bounds of the drawing in design space (incl. stroke), used to
# center it optically rather than by the 300x212 box.
BOUNDS = (12 - STROKE / 2, 11 - STROKE / 2, 288 + STROKE / 2, 203 + STROKE / 2)

SS = 4  # supersampling factor


def _font(px: float) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(FONT_PATH, round(px))
    try:
        font.set_variation_by_axes([FONT_WEIGHT])
    except (OSError, ValueError):
        pass
    return font


def draw_scales(size: int, width_frac: float, background, mono: bool = False) -> Image.Image:
    """Draws the scales centered on a size x size canvas.

    width_frac: drawing width (visual bounds) as a fraction of the canvas.
    background: RGB tuple, or None for a transparent canvas.
    mono: single-color (white) silhouette for Android themed icons; the pan
          words are knocked out of the filled pans.
    """
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0) if background is None else background + (255,))
    draw = ImageDraw.Draw(img)

    bx0, by0, bx1, by1 = BOUNDS
    scale = big * width_frac / (bx1 - bx0)
    ox = big / 2 - (bx0 + bx1) / 2 * scale
    oy = big / 2 - (by0 + by1) / 2 * scale

    def p(x, y):
        return (ox + x * scale, oy + y * scale)

    line_c = WHITE if mono else LINE
    pan_c = WHITE if mono else PAN_FILL
    sw = max(1, round(STROKE * scale))

    def cap(pt, w):
        r = w / 2
        draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=line_c)

    def line(a, b, w=sw):
        pa, pb = p(*a), p(*b)
        draw.line([pa, pb], fill=line_c, width=w)
        cap(pa, w)  # round caps, like StrokeCap.round in the widget
        cap(pb, w)

    # Topper ring.
    cx, cy = p(150, 16)
    r = 5.5 * scale
    draw.ellipse([cx - r - sw / 2, cy - r - sw / 2, cx + r + sw / 2, cy + r + sw / 2], outline=line_c, width=sw)
    line((150, 16 + 5.5), (150, 192))   # stand
    line((112, 192), (188, 192))        # base, upper line
    line((122, 203), (178, 203))        # base, lower line
    line((50, 44), (250, 44))           # beam

    font = _font(FONT_SIZE * scale)
    psw = max(1, round(PAN_STROKE * scale))

    def pan(origin, tl_d, tr_d, text_cx, text):
        line(origin, tl_d)
        line(origin, tr_d)
        tl, tr = p(*tl_d), p(*tr_d)
        mx = (tl[0] + tr[0]) / 2
        rx = (tr[0] - tl[0]) / 2
        ry = 34 * scale
        pts = [(mx + rx * math.cos(math.pi * i / 96), tl[1] + ry * math.sin(math.pi * i / 96)) for i in range(97)]
        draw.polygon(pts, fill=pan_c)
        if not mono:
            draw.line(pts + [pts[0]], fill=line_c, width=psw, joint="curve")
        tcx, tcy = p(text_cx, 136)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        pos = (tcx - tw / 2 - bbox[0], tcy - th / 2 - bbox[1])
        if mono:
            # Knock the word out of the white pan.
            mask = Image.new("L", img.size, 0)
            ImageDraw.Draw(mask).text(pos, text, fill=255, font=font)
            img.paste((0, 0, 0, 0), (0, 0), mask)
        else:
            draw.text(pos, text, fill=PAN_TEXT, font=font)

    pan((50, 44), (12, 118), (88, 118), 50, "Law")
    pan((250, 44), (212, 118), (288, 118), 250, "Bid")

    # Pivot, drawn last so it sits over the beam.
    cx, cy = p(150, 44)
    r = 8 * scale
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=line_c)

    return img.resize((size, size), Image.LANCZOS)


ANDROID_RES = "android/app/src/main/res/"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

# Adaptive layers are 108dp; the launcher always shows the inner 72dp and
# guarantees only a 66dp circle. 60dp-wide scales keep every pan inside it
# with breathing room on squircle launchers (Samsung).
ADAPTIVE_WIDTH = 60 / 108
# Full-bleed squares (iOS, legacy Android): the OS rounds the corners.
FULL_BLEED_WIDTH = 0.82


def write_android() -> None:
    for name, mult in DENSITIES.items():
        folder = f"{ANDROID_RES}mipmap-{name}/"
        legacy = round(48 * mult)
        layer = round(108 * mult)
        draw_scales(legacy, FULL_BLEED_WIDTH, BG).convert("RGB").save(folder + "ic_launcher.png")
        draw_scales(layer, ADAPTIVE_WIDTH, None).save(folder + "ic_launcher_foreground.png")
        draw_scales(layer, ADAPTIVE_WIDTH, None, mono=True).save(folder + "ic_launcher_monochrome.png")

    os.makedirs(f"{ANDROID_RES}mipmap-anydpi-v26", exist_ok=True)
    with open(f"{ANDROID_RES}mipmap-anydpi-v26/ic_launcher.xml", "w") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<!-- Generated by tool/generate_app_icon.py -->\n"
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background" />\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
            '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
            "</adaptive-icon>\n"
        )
    with open(f"{ANDROID_RES}values/ic_launcher_background.xml", "w") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<!-- Generated by tool/generate_app_icon.py -->\n"
            "<resources>\n"
            '    <color name="ic_launcher_background">#%02X%02X%02X</color>\n' % BG
            + "</resources>\n"
        )


def write_ios() -> None:
    base = "ios/Runner/Assets.xcassets/AppIcon.appiconset/"
    sizes = {
        "Icon-App-20x20@1x.png": 20,
        "Icon-App-20x20@2x.png": 40,
        "Icon-App-20x20@3x.png": 60,
        "Icon-App-29x29@1x.png": 29,
        "Icon-App-29x29@2x.png": 58,
        "Icon-App-29x29@3x.png": 87,
        "Icon-App-40x40@1x.png": 40,
        "Icon-App-40x40@2x.png": 80,
        "Icon-App-40x40@3x.png": 120,
        "Icon-App-60x60@2x.png": 120,
        "Icon-App-60x60@3x.png": 180,
        "Icon-App-76x76@1x.png": 76,
        "Icon-App-76x76@2x.png": 152,
        "Icon-App-83.5x83.5@2x.png": 167,
        "Icon-App-1024x1024@1x.png": 1024,
    }
    for name, px in sizes.items():
        # App Store rejects an alpha channel on the 1024 icon: save as RGB.
        draw_scales(px, FULL_BLEED_WIDTH, BG).convert("RGB").save(base + name)


if __name__ == "__main__":
    write_android()
    write_ios()
    print("Wrote Android adaptive + legacy icons and the iOS AppIcon set.")
