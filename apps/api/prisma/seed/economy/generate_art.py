#!/usr/bin/env python3
"""Draws the starter gifts and sticker packs (our own art, no outside
sources): python3 generate_art.py  ->  gifts/*.png, stickers/<pack>/*.png.
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


# ---- gifts ----------------------------------------------------------------

def g_rose():
    im, d = canvas()
    d.line([(512, 560), (512, 900)], fill=GREEN_D, width=34)
    d.polygon([(512, 760), (700, 690), (640, 820)], fill=GREEN)
    d.polygon([(512, 820), (350, 760), (400, 880)], fill=GREEN)
    circ(d, 512, 400, 230, RED_D)
    circ(d, 440, 380, 150, RED)
    circ(d, 590, 380, 150, RED)
    circ(d, 512, 330, 140, RED)
    circ(d, 512, 420, 110, RED_D)
    circ(d, 512, 400, 60, RED)
    shine(d, 430, 320, 28)
    return im


def g_heart():
    im, d = canvas()
    d.polygon(heart_pts(512, 530, 400), fill=RED_D)
    d.polygon(heart_pts(512, 505, 380), fill=RED)
    shine(d, 330, 360, 46)
    return im


def g_star():
    im, d = canvas()
    d.polygon(star_pts(512, 540, 400, 170), fill=GOLD_D)
    d.polygon(star_pts(512, 520, 380, 160), fill=GOLD)
    shine(d, 440, 400, 34)
    return im


def g_trophy():
    im, d = canvas()
    d.arc([140, 220, 400, 520], 90, 270, fill=GOLD_D, width=44)
    d.arc([624, 220, 884, 520], 270, 90, fill=GOLD_D, width=44)
    d.pieslice([280, 130, 744, 600], 0, 180, fill=GOLD)
    d.rectangle([280, 130, 744, 360], fill=GOLD)
    d.rectangle([470, 560, 554, 740], fill=GOLD_D)
    rrect(d, 340, 740, 684, 830, 24, GOLD)
    rrect(d, 280, 830, 744, 910, 24, BROWN)
    d.polygon(star_pts(512, 330, 90, 38), fill=WHITE)
    shine(d, 360, 250, 26)
    return im


def g_crown():
    im, d = canvas()
    d.polygon([(170, 760), (130, 300), (330, 520), (512, 220), (694, 520), (894, 300), (854, 760)], fill=GOLD)
    rrect(d, 170, 740, 854, 840, 30, GOLD_D)
    for x, c in ((130, RED), (512, BLUE), (894, GREEN)):
        circ(d, x, 280 if x != 512 else 200, 46, c)
    for x in (340, 512, 684):
        circ(d, x, 790, 26, WHITE)
    return im


def g_diamond():
    im, d = canvas()
    d.polygon([(250, 330), (774, 330), (900, 470), (512, 900), (124, 470)], fill=BLUE)
    d.polygon([(250, 330), (400, 470), (512, 330)], fill=(120, 180, 255, 255))
    d.polygon([(774, 330), (624, 470), (512, 330)], fill=(100, 160, 250, 255))
    d.polygon([(124, 470), (400, 470), (512, 900)], fill=BLUE_D)
    d.polygon([(900, 470), (624, 470), (512, 900)], fill=(50, 105, 210, 255))
    d.polygon([(400, 470), (624, 470), (512, 900)], fill=(86, 150, 244, 255))
    d.polygon([(250, 330), (512, 330), (400, 470), (124, 470)], fill=(110, 170, 255, 255))
    shine(d, 300, 400, 22)
    return im


def g_giftbox():
    im, d = canvas()
    rrect(d, 170, 400, 854, 880, 36, RED)
    rrect(d, 130, 300, 894, 440, 30, RED_D)
    d.rectangle([452, 300, 572, 880], fill=GOLD)
    d.ellipse([260, 130, 520, 320], outline=GOLD, width=48)
    d.ellipse([504, 130, 764, 320], outline=GOLD, width=48)
    circ(d, 512, 300, 54, GOLD_D)
    return im


def g_balloon():
    im, d = canvas()
    d.line([(512, 700), (470, 900), (540, 940)], fill=SILVER_D, width=12)
    d.ellipse([240, 90, 784, 720], fill=PURPLE)
    d.polygon([(480, 700), (544, 700), (512, 750)], fill=PURPLE_D)
    d.ellipse([320, 170, 480, 380], fill=(190, 160, 240, 255))
    shine(d, 380, 240, 26)
    return im


def g_cake():
    im, d = canvas()
    rrect(d, 150, 520, 874, 880, 40, PINK)
    rrect(d, 200, 340, 824, 560, 40, WHITE)
    for x in range(210, 830, 70):
        circ(d, x, 540, 40, WHITE)
    for x, c in ((330, RED), (512, BLUE), (694, GREEN)):
        rrect(d, x - 18, 220, x + 18, 340, 6, c)
        d.polygon([(x, 130), (x - 26, 200), (x + 26, 200)], fill=ORANGE)
    for x in range(220, 820, 110):
        circ(d, x, 700, 18, WHITE)
    return im


def g_coffee():
    im, d = canvas()
    d.arc([660, 400, 900, 700], 270, 90, fill=BROWN, width=52)
    d.polygon([(180, 380), (780, 380), (720, 800), (240, 800)], fill=WHITE)
    d.polygon([(200, 440), (760, 440), (726, 800), (240, 800)], fill=BROWN)
    rrect(d, 120, 810, 840, 880, 34, SILVER)
    for x in (340, 480, 620):
        d.arc([x - 40, 120, x + 40, 340], 60, 300, fill=SILVER, width=22)
    return im


def g_scales():
    im, d = canvas()
    d.rectangle([488, 220, 536, 800], fill=GOLD_D)
    rrect(d, 330, 800, 694, 890, 26, GOLD)
    d.rectangle([180, 240, 844, 280], fill=GOLD)
    circ(d, 512, 220, 50, GOLD)
    for x in (230, 794):
        d.line([(x, 270), (x - 110, 560)], fill=GOLD_D, width=14)
        d.line([(x, 270), (x + 110, 560)], fill=GOLD_D, width=14)
        d.pieslice([x - 150, 460, x + 150, 700], 0, 180, fill=GOLD)
    return im


def g_gavel():
    im, d = canvas()
    gv = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    g = ImageDraw.Draw(gv)
    rrect(g, 250, 190, 780, 400, 50, BROWN)
    rrect(g, 220, 200, 290, 390, 24, BROWN_D)
    rrect(g, 740, 200, 810, 390, 24, BROWN_D)
    rrect(g, 470, 380, 560, 880, 36, BROWN_D)
    gv = gv.rotate(35, resample=Image.BICUBIC, center=(512, 512))
    im.alpha_composite(gv)
    d = ImageDraw.Draw(im)
    rrect(d, 200, 830, 660, 910, 36, BROWN_D)
    return im


def g_shield():
    im, d = canvas()
    d.polygon([(512, 110), (860, 230), (830, 560), (512, 910), (194, 560), (164, 230)], fill=NAVY)
    d.polygon([(512, 190), (780, 280), (758, 540), (512, 810), (266, 540), (244, 280)], fill=BLUE)
    d.polygon(star_pts(512, 490, 190, 80), fill=WHITE)
    return im


def g_rocket():
    im, d = canvas()
    d.polygon([(512, 560), (400, 900), (512, 800), (624, 900)], fill=ORANGE)
    d.polygon([(512, 640), (450, 840), (512, 780), (574, 840)], fill=GOLD)
    d.ellipse([360, 120, 664, 760], fill=WHITE)
    d.pieslice([360, 120, 664, 520], 180, 360, fill=RED)
    d.polygon([(380, 520), (230, 700), (390, 690)], fill=RED)
    d.polygon([(644, 520), (794, 700), (634, 690)], fill=RED)
    circ(d, 512, 420, 70, BLUE_D)
    circ(d, 512, 420, 48, (120, 190, 255, 255))
    return im


def g_clover():
    im, d = canvas()
    d.line([(512, 560), (560, 900)], fill=GREEN_D, width=34)
    for cx, cy in ((400, 400), (624, 400), (400, 600), (624, 600)):
        circ(d, cx, cy, 130, GREEN)
        circ(d, cx - 20, cy - 24, 34, (140, 214, 150, 255))
    circ(d, 512, 500, 60, GREEN_D)
    return im


def g_medal():
    im, d = canvas()
    d.polygon([(300, 100), (440, 100), (560, 480), (440, 520)], fill=BLUE)
    d.polygon([(724, 100), (584, 100), (464, 480), (584, 520)], fill=RED)
    circ(d, 512, 640, 270, GOLD_D)
    circ(d, 512, 640, 225, GOLD)
    d.polygon(star_pts(512, 640, 150, 62), fill=WHITE)
    return im


def g_key():
    im, d = canvas()
    circ(d, 330, 330, 210, GOLD)
    circ(d, 330, 330, 100, (0, 0, 0, 0))
    d.ellipse([230, 230, 430, 430], fill=(0, 0, 0, 0))
    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    r = ImageDraw.Draw(ring)
    r.ellipse([120, 120, 540, 540], fill=GOLD)
    r.ellipse([240, 240, 420, 420], fill=(0, 0, 0, 0))
    r.polygon([(480, 480), (900, 900), (840, 960), (420, 540)], fill=GOLD_D)
    r.polygon([(780, 780), (860, 700), (910, 750), (830, 830)], fill=GOLD)
    return ring


GIFTS = [
    ('rose', 'Rose', 25, g_rose), ('heart', 'Heart', 15, g_heart), ('star', 'Star', 30, g_star),
    ('balloon', 'Balloon', 20, g_balloon), ('coffee', 'Coffee', 35, g_coffee), ('clover', 'Lucky clover', 40, g_clover),
    ('giftbox', 'Gift box', 50, g_giftbox), ('cake', 'Cake', 60, g_cake), ('gavel', 'Gavel', 75, g_gavel),
    ('scales', 'Scales of justice', 100, g_scales), ('shield', 'Shield', 120, g_shield), ('key', 'Golden key', 150, g_key),
    ('medal', 'Medal', 200, g_medal), ('rocket', 'Rocket', 300, g_rocket), ('trophy', 'Trophy', 500, g_trophy),
    ('diamond', 'Diamond', 800, g_diamond), ('crown', 'Crown', 1000, g_crown),
]

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
    for key, _t, _p, fn in GIFTS:
        save(fn(), 'gifts', f'{key}.png')
    for slug, _t, _s, _p, items in PACKS:
        for i, (_e, body, shade, eyes, mouth, extra) in enumerate(items):
            save(face(body, shade, eyes, mouth, extra), 'stickers', slug, f'{i + 1:02d}.png')
    import json
    cat = {
        'gifts': [{'file': f'gifts/{k}.png', 'code': k, 'title': t, 'priceStars': pr} for k, t, pr, _ in GIFTS],
        'packs': [
            {'title': t, 'shortName': sn, 'priceStars': pr,
             'stickers': [{'file': f'stickers/{slug}/{i + 1:02d}.png', 'emoji': it[0]} for i, it in enumerate(items)]}
            for slug, t, sn, pr, items in PACKS
        ],
    }
    with open(os.path.join(OUT, 'catalog.json'), 'w', encoding='utf-8') as f:
        json.dump(cat, f, ensure_ascii=False, indent=1)
    print('ok')
