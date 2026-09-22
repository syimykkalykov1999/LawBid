#!/usr/bin/env python3
"""Generates the LawBid app launcher icon (iOS + Android) from scratch.

2026-09-22 owner request: the app icon should be the same scales-of-justice
mark used inside the app (see lib/core/design_system/widgets/display/
scales_logo.dart), with the same "Law"/"Bid" pan inscriptions -- not a
separate design. This script is a from-scratch Python/Pillow re-drawing of
that CustomPainter's geometry (not a screenshot or export of the Flutter
widget -- this repo's tooling bridge has no way to run Flutter and render
it directly), scaled into a square icon canvas.

Uses the static (angle=0) pose deliberately, not the welcome screen's
subtle idle-animation tilt: at angle=0 every pan sits at its exact
un-rotated base coordinate (see _ScalesPainter.paint()'s rotation math --
translation and panRotation both reduce to zero), which also just reads
as a cleaner, more symmetric mark at icon sizes.

Colors intentionally reuse dark theme's palette (AppColorsDark in
tokens/app_colors.dart) rather than introducing new hex values: navy
background, gold stroke, white pan fill, navy pan text -- the same pair
the owner approved for the welcome screen's dark-theme phone button and
pan fill earlier in this session (docs/CHANGELOG.md).

Run from apps/mobile/:
    python3 tool/generate_app_icon.py
Requires Pillow (`pip install Pillow`) and a serif bold TTF font -- edit
FONT_PATH below if Liberation Serif isn't available on your machine.
"""

import math

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"

BG = (10, 26, 63)          # #0A1A3F -- AppColorsDark navy/accent family
LINE = (212, 175, 90)      # #D4AF5A -- AppColorsDark.goldStroke
PAN_FILL = (255, 255, 255)  # #FFFFFF -- AppColorsDark.panFill
PAN_TEXT = (10, 26, 63)    # #0A1A3F -- AppColorsDark.panText

CANVAS = 2048  # master resolution; every platform size is downsampled from this


def build_master() -> Image.Image:
    img = Image.new("RGB", (CANVAS, CANVAS), BG)
    draw = ImageDraw.Draw(img)

    # Design space is 300x212 (scales_logo.dart). Fit into ~74% of the
    # canvas width, centered both axes -- standard icon safe-zone padding.
    content_w = CANVAS * 0.74
    scale = content_w / 300
    content_h = 212 * scale
    ox = (CANVAS - content_w) / 2
    oy = (CANVAS - content_h) / 2

    def p(x, y):
        return (ox + x * scale, oy + y * scale)

    stroke_w = max(2, round(2.6 * scale))

    def line(p1, p2, width=stroke_w):
        draw.line([p(*p1), p(*p2)], fill=LINE, width=width, joint="curve")

    def circle_stroke(center, r, width=stroke_w):
        cx, cy = p(*center)
        rr = r * scale
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=LINE, width=width)

    def circle_fill(center, r):
        cx, cy = p(*center)
        rr = r * scale
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=LINE)

    circle_stroke((150, 16), 5)          # topper
    line((150, 21), (150, 192))          # stand
    line((112, 192), (188, 192))         # base, upper line
    line((122, 203), (178, 203))         # base, lower line
    line((50, 44), (250, 44))            # beam

    def pan(origin, bowl_tl, bowl_tr, text_cx, text):
        line(origin, bowl_tl)
        line(origin, bowl_tr)
        tl = p(*bowl_tl)
        tr = p(*bowl_tr)
        cx = (tl[0] + tr[0]) / 2
        top_y = tl[1]
        rx = (tr[0] - tl[0]) / 2
        ry = 34 * scale
        # Half-ellipse bulging downward (the CustomPainter's arcToPoint
        # radius (38,34) bowl), approximated as a polygon -- smooth enough
        # at this resolution once downsampled with LANCZOS.
        pts = [tl]
        steps = 64
        for i in range(steps + 1):
            t = math.pi * i / steps
            pts.append((cx + rx * math.cos(t), top_y + ry * math.sin(t)))
        pts.append(tr)
        draw.polygon(pts, fill=PAN_FILL)
        outline_w = max(2, round(1.6 * scale))
        draw.line([tl, tr], fill=LINE, width=outline_w)
        draw.line(pts[1:], fill=LINE, width=outline_w, joint="curve")

        font = ImageFont.truetype(FONT_PATH, round(19 * scale))
        tcx, tcy = p(text_cx, 135)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((tcx - tw / 2 - bbox[0], tcy - th / 2 - bbox[1]), text, fill=PAN_TEXT, font=font)

    pan((50, 44), (12, 118), (88, 118), 50, "Law")
    pan((250, 44), (212, 118), (288, 118), 250, "Bid")
    circle_fill((150, 44), 6)  # pivot, drawn last so it sits over the beam/threads

    return img


def write_sizes(master: Image.Image) -> None:
    ios_base = "ios/Runner/Assets.xcassets/AppIcon.appiconset/"
    ios_sizes = {
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
    for name, px in ios_sizes.items():
        master.resize((px, px), Image.LANCZOS).save(ios_base + name)

    android_sizes = {
        "android/app/src/main/res/mipmap-mdpi/ic_launcher.png": 48,
        "android/app/src/main/res/mipmap-hdpi/ic_launcher.png": 72,
        "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png": 96,
        "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png": 144,
        "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png": 192,
    }
    for path, px in android_sizes.items():
        master.resize((px, px), Image.LANCZOS).save(path)

    print(f"Wrote {len(ios_sizes)} iOS + {len(android_sizes)} Android icon files.")


if __name__ == "__main__":
    write_sizes(build_master().convert("RGB"))
