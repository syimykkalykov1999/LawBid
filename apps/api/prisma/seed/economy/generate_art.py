#!/usr/bin/env python3
"""Draws the starter sticker packs (our own art, no outside sources):
python3 generate_art.py  ->  stickers/<pack>/*.png. Owner 26.11: gifts are gone.
512x512 transparent PNG, drawn at 2x and downsampled for smooth edges."""
import math
import os
from PIL import Image, ImageDraw

S = 1024
OUT = os.path.dirname(os.path.abspath(__file__))


def canvas():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def save(im, *path):
    p = os.path.join(OUT, *path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.resize((512, 512), Image.LANCZOS).save(p, optimize=True)


def circ(d, cx, cy, r, fill, outline=None, w=0):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill, outline=outline, width=w)


def rrect(d, x0, y0, x1, y1, r, fill, outline=None, w=0):
    d.rounded_rectangle([x0, y0, x1, y1], r, fill=fill, outline=outline, width=w)


def star_pts(cx, cy, ro, ri, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        a = math.radians(rot + i * 180 / n)
        r = ro if i % 2 == 0 else ri
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def heart_pts(cx, cy, size):
    pts = []
    for i in range(361):
        t = math.radians(i)
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * size / 17, cy - y * size / 17))
    return pts


INK = (38, 42, 66, 255)
GOLD = (236, 178, 46, 255)
GOLD_D = (190, 134, 24, 255)
RED = (226, 62, 87, 255)
RED_D = (171, 34, 60, 255)
PINK = (244, 133, 166, 255)
BLUE = (66, 133, 244, 255)
BLUE_D = (36, 88, 190, 255)
TEAL = (38, 177, 160, 255)
TEAL_D = (20, 124, 112, 255)
GREEN = (72, 168, 84, 255)
GREEN_D = (40, 114, 54, 255)
PURPLE = (140, 94, 214, 255)
PURPLE_D = (96, 58, 164, 255)
ORANGE = (244, 140, 52, 255)
BROWN = (128, 82, 52, 255)
BROWN_D = (86, 52, 32, 255)
WHITE = (255, 255, 255, 255)
SILVER = (196, 204, 216, 255)
SILVER_D = (140, 150, 166, 255)
NAVY = (30, 52, 104, 255)


def shine(d, x, y, r):
    circ(d, x, y, r, (255, 255, 255, 150))


# ---- stickers: faces with expressions and accessories --------------------


def face(body, shade, eyes='dot', mouth='smile', extra=()):
    im, d = canvas()
    circ(d, 512, 540, 400, shade)
    circ(d, 512, 520, 390, body)
    shine(d, 360, 330, 40)
    L, R = 370, 654
    if eyes == 'dot':
        for x in (L, R):
            circ(d, x, 470, 44, INK)
            circ(d, x - 12, 456, 14, WHITE)
    elif eyes == 'happy':
        for x in (L, R):
            d.arc([x - 55, 420, x + 55, 520], 200, 340, fill=INK, width=28)
    elif eyes == 'wink':
        circ(d, L, 470, 44, INK)
        d.arc([R - 55, 430, R + 55, 520], 20, 160, fill=INK, width=28)
    elif eyes == 'hearts':
        for x in (L, R):
            d.polygon(heart_pts(x, 470, 80), fill=RED)
    elif eyes == 'stars':
        for x in (L, R):
            d.polygon(star_pts(x, 470, 70, 30), fill=RED)
    elif eyes == 'shades':
        rrect(d, 270, 420, 480, 520, 40, INK)
        rrect(d, 544, 420, 754, 520, 40, INK)
        d.rectangle([480, 440, 544, 462], fill=INK)
        shine(d, 330, 450, 12)
    elif eyes == 'closed':
        for x in (L, R):
            d.arc([x - 55, 440, x + 55, 520], 20, 160, fill=INK, width=28)
    elif eyes == 'angry':
        for x in (L, R):
            circ(d, x, 480, 40, INK)
        d.line([(300, 380), (430, 430)], fill=INK, width=30)
        d.line([(724, 380), (594, 430)], fill=INK, width=30)
    elif eyes == 'wide':
        for x in (L, R):
            circ(d, x, 470, 66, WHITE, INK, 14)
            circ(d, x, 470, 24, INK)
    if mouth == 'smile':
        d.arc([360, 560, 664, 780], 20, 160, fill=INK, width=30)
    elif mouth == 'laugh':
        d.pieslice([340, 560, 684, 820], 0, 180, fill=INK)
        d.pieslice([410, 690, 614, 820], 0, 180, fill=RED)
    elif mouth == 'sad':
        d.arc([380, 680, 644, 860], 200, 340, fill=INK, width=30)
    elif mouth == 'o':
        circ(d, 512, 700, 60, INK)
    elif mouth == 'flat':
        d.line([(400, 720), (624, 720)], fill=INK, width=30)
    elif mouth == 'tongue':
        d.arc([360, 560, 664, 780], 20, 160, fill=INK, width=30)
        rrect(d, 470, 700, 560, 800, 36, PINK)
    elif mouth == 'grit':
        rrect(d, 380, 690, 644, 780, 24, WHITE, INK, 20)
        d.line([(512, 690), (512, 780)], fill=INK, width=12)
    for e in extra:
        e(d)
    return im


def cheeks(d):
    circ(d, 290, 620, 44, (255, 150, 160, 160))
    circ(d, 734, 620, 44, (255, 150, 160, 160))


def tear(d):
    d.polygon([(654, 520), (610, 600), (698, 600)], fill=(110, 180, 255, 255))
    circ(d, 654, 610, 44, (110, 180, 255, 255))


def party_hat(d):
    d.polygon([(512, 20), (350, 250), (674, 250)], fill=PURPLE)
    d.polygon([(512, 20), (460, 250), (512, 250)], fill=PURPLE_D)
    circ(d, 512, 30, 40, GOLD)
    for x in (400, 512, 624):
        circ(d, x, 215, 16, WHITE)


def crown(d):
    d.polygon([(330, 230), (310, 40), (420, 130), (512, 10), (604, 130), (714, 40), (694, 230)], fill=GOLD)
    rrect(d, 330, 210, 694, 270, 20, GOLD_D)


def sparkles(d):
    for x, y, r in ((130, 200, 60), (900, 260, 46), (880, 760, 56), (150, 780, 40)):
        d.polygon(star_pts(x, y, r, r // 3, 4, -90), fill=GOLD)


def sweat(d):
    d.polygon([(780, 300), (740, 380), (820, 380)], fill=(110, 180, 255, 255))
    circ(d, 780, 385, 40, (110, 180, 255, 255))


def halo(d):
    d.ellipse([340, 8, 684, 100], outline=GOLD, width=26)


def horns(d):
    d.polygon([(250, 260), (230, 80), (380, 190)], fill=RED_D)
    d.polygon([(774, 260), (794, 80), (644, 190)], fill=RED_D)


def confetti(d):
    cols = [RED, BLUE, GREEN, GOLD, PINK, PURPLE]
    for i, (x, y) in enumerate(((100, 140), (230, 60), (800, 90), (920, 220), (90, 520), (940, 560), (140, 900), (880, 900), (500, 40))):
        d.polygon(star_pts(x, y, 34, 14, 4, i * 20), fill=cols[i % len(cols)])


PACKS = [
    ('mood', 'Mood', 'lawbid_mood', 0, [
        ('😀', TEAL, TEAL_D, 'dot', 'smile', [cheeks]), ('😂', ORANGE, GOLD_D, 'happy', 'laugh', [tear]),
        ('😉', PINK, RED_D, 'wink', 'tongue', []), ('😎', BLUE, BLUE_D, 'shades', 'smile', []),
        ('😍', PINK, RED_D, 'hearts', 'laugh', []), ('😢', (150, 190, 240, 255), BLUE_D, 'dot', 'sad', [tear]),
        ('😡', RED, RED_D, 'angry', 'grit', []), ('😮', GOLD, GOLD_D, 'wide', 'o', [])]),
    ('party', 'Party', 'lawbid_party', 49, [
        ('🥳', PURPLE, PURPLE_D, 'happy', 'laugh', [party_hat, confetti]), ('🎉', ORANGE, GOLD_D, 'stars', 'laugh', [confetti]),
        ('🤩', GOLD, GOLD_D, 'stars', 'smile', [sparkles]), ('😇', (150, 210, 250, 255), BLUE_D, 'closed', 'smile', [halo, cheeks]),
        ('😈', PURPLE, PURPLE_D, 'angry', 'smile', [horns]), ('🥰', PINK, RED_D, 'closed', 'smile', [cheeks, sparkles]),
        ('😅', TEAL, TEAL_D, 'dot', 'flat', [sweat]), ('😴', (170, 160, 230, 255), PURPLE_D, 'closed', 'o', [])]),
    ('royal', 'Royal', 'lawbid_royal', 99, [
        ('👑', GOLD, GOLD_D, 'dot', 'smile', [crown]), ('🤴', TEAL, TEAL_D, 'shades', 'smile', [crown]),
        ('💎', BLUE, BLUE_D, 'stars', 'laugh', [sparkles]), ('🔥', ORANGE, RED_D, 'angry', 'grit', [sparkles]),
        ('🏆', GOLD, GOLD_D, 'happy', 'laugh', [crown, sparkles]), ('😌', PINK, RED_D, 'closed', 'smile', [crown, cheeks]),
        ('🤝', GREEN, GREEN_D, 'dot', 'smile', [sparkles]), ('⚖️', NAVY, (20, 32, 70, 255), 'wide', 'flat', [crown])]),
]

if __name__ == '__main__':
    for slug, _t, _s, _p, items in PACKS:
        for i, (_e, body, shade, eyes, mouth, extra) in enumerate(items):
            save(face(body, shade, eyes, mouth, extra), 'stickers', slug, f'{i + 1:02d}.png')
    import json
    cat = {
        'packs': [
            {'title': t, 'shortName': sn, 'priceStars': pr,
             'stickers': [{'file': f'stickers/{slug}/{i + 1:02d}.png', 'emoji': it[0]} for i, it in enumerate(items)]}
            for slug, t, sn, pr, items in PACKS
        ],
    }
    with open(os.path.join(OUT, 'catalog.json'), 'w', encoding='utf-8') as f:
        json.dump(cat, f, ensure_ascii=False, indent=1)
    print('ok')
