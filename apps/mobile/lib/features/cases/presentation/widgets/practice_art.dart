import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-09-30: every case / post card carries artwork for its practice
/// category on the right, dissolving into the card background (brighter on
/// light, dimmer on dark) so it never hides the text.
///
/// A real photo is used when `assets/practice_art/<categoryCode>.jpg` is
/// bundled (declared in pubspec); until then an on-brand fallback is drawn:
/// a soft gold glow with the category's glyph.
IconData practiceGlyph(String? categoryCode) => switch (categoryCode) {
      'traffic_tickets' => AppIcons.directionsCarFilledRounded,
      'dui_and_dwi' => AppIcons.localPoliceRounded,
      'criminal_defense' => AppIcons.gavelRounded,
      'family_law' => AppIcons.familyRestroomRounded,
      'immigration' => AppIcons.flightTakeoffRounded,
      'personal_injury' => AppIcons.personalInjuryRounded,
      'medical_malpractice' => AppIcons.medicalServicesRounded,
      'workers_compensation' => AppIcons.engineeringRounded,
      'estate_planning_and_probate' => AppIcons.historyEduRounded,
      'elder_law' => AppIcons.elderlyRounded,
      'real_estate' => AppIcons.homeWorkRounded,
      'landlord_and_tenant' => AppIcons.apartmentRounded,
      'employment_and_labor' => AppIcons.workRounded,
      'bankruptcy_and_debt' => AppIcons.accountBalanceWalletRounded,
      'business_and_corporate' => AppIcons.businessCenterRounded,
      'intellectual_property' => AppIcons.lightbulbRounded,
      'tax_law' => AppIcons.receiptLongRounded,
      'consumer_protection' => AppIcons.shieldRounded,
      'insurance_law' => AppIcons.healthAndSafetyRounded,
      'veterans_and_military' => AppIcons.militaryTechRounded,
      'civil_rights' => AppIcons.diversity3Rounded,
      'education_law' => AppIcons.schoolRounded,
      'construction_law' => AppIcons.constructionRounded,
      'environmental_and_energy_law' => AppIcons.ecoRounded,
      'technology_privacy_and_cyber_law' => AppIcons.securityRounded,
      'aviation_and_maritime_law' => AppIcons.sailingRounded,
      'animal_law' => AppIcons.petsRounded,
      _ => AppIcons.balanceRounded,
    };

/// Owner 2026-10-15: every practice category has its own colour — the
/// glow in the card's corner, the header band and the main chip. The key
/// practices keep hand-picked hues; the others are spread by the golden
/// angle so no two neighbours look alike. Muted, readable on dark and light.
const _kPracticeHues = <String, double>{
  'immigration': 216,
  'family_law': 340,
  'traffic_tickets': 38,
  'dui_and_dwi': 22,
  'intellectual_property': 255,
  'real_estate': 152,
  'criminal_defense': 8,
  'business_and_corporate': 188,
};

final Map<String, double> _practiceHues = () {
  final codes =
      (kPracticeArtAssets.where((c) => !c.contains('.')).toList()..sort());
  final used = <double>[..._kPracticeHues.values];
  final out = <String, double>{..._kPracticeHues};
  for (final (i, code) in codes.indexed) {
    if (out.containsKey(code)) continue;
    var hue = (i * 137.508 + 60) % 360;
    // Never closer than 6 degrees to another practice's hue.
    while (used.any((u) => ((u - hue + 540) % 360 - 180).abs() < 6)) {
      hue = (hue + 7) % 360;
    }
    used.add(hue);
    out[code] = hue;
  }
  return out;
}();

/// The practice's colour on a card whose background is [surface]: lighter
/// on a dark theme, darker on a light one, and stepped until it stands out
/// from the surface (contrast >= 3) in every theme (Day, Night, Navy, Glass).
Color practiceAccent(String? categoryCode, {required Color surface}) {
  final hue = _practiceHues[categoryCode] ?? 45.0;
  final dark = surface.computeLuminance() < 0.4;
  var l = dark ? 0.6 : 0.46;
  Color at(double lightness) =>
      HSLColor.fromAHSL(1, hue, 0.58, lightness).toColor();
  double contrast(Color a, Color b) {
    final x = a.computeLuminance();
    final y = b.computeLuminance();
    return (math.max(x, y) + 0.05) / (math.min(x, y) + 0.05);
  }

  for (var i = 0; i < 12 && contrast(at(l), surface) < 3; i++) {
    l = (l + (dark ? 0.03 : -0.03)).clamp(0.2, 0.85);
  }
  return at(l);
}

/// WCAG contrast ratio of two opaque colours.
double contrastRatio(Color a, Color b) {
  final x = a.computeLuminance();
  final y = b.computeLuminance();
  return (math.max(x, y) + 0.05) / (math.min(x, y) + 0.05);
}

/// Owner 2026-10-15: [color] nudged (lighter on a dark [bg], darker on a
/// light one) until it reads on [bg] with at least [min]:1 contrast — a
/// practice colour on its own tinted header must never melt into it.
Color readableOn(Color color, Color bg, {double min = 4.5}) {
  if (contrastRatio(color, bg) >= min) return color;
  final dark = bg.computeLuminance() < 0.4;
  final hsl = HSLColor.fromColor(color);
  var l = hsl.lightness;
  for (var i = 0; i < 40; i++) {
    l = (l + (dark ? 0.025 : -0.025)).clamp(0.0, 1.0);
    final c = hsl.withLightness(l).toColor();
    if (contrastRatio(c, bg) >= min) return c;
  }
  return dark ? Colors.white : Colors.black;
}

/// What a card really looks like on: its surface over the page. The Glass
/// theme has a translucent surface on a transparent page, so it is judged
/// over the glass gradient's solid colour.
Color practiceCardBase(AppColorTokens colors) => Color.alphaBlend(
      colors.surface,
      colors.bg.a < 1 ? AppColorsGlass.barSolid : colors.bg,
    );

/// Legible text on [accent].
Color onPracticeAccent(Color accent) {
  final l = accent.computeLuminance();
  // White or near-black, whichever contrasts more.
  final white = 1.05 / (l + 0.05);
  final black = (l + 0.05) / 0.05;
  return black > white ? Colors.black87 : Colors.white;
}

/// Bundled photo art (owner-supplied / licensed images), keyed by a leaf
/// practice code (`traffic_tickets.cdl_violations`) or a category code
/// (`family_law`); the leaf wins. Keep in sync with `assets/practice_art/`.
const Set<String> kPracticeArtAssets = {
  'agriculture_and_gaming_law',
  'animal_law',
  'antitrust_and_trade_regulation',
  'appeals',
  'aviation_and_maritime_law',
  'bankruptcy_and_debt',
  'business_and_corporate',
  'cannabis_alcohol_and_firearms_law',
  'civil_litigation',
  'civil_rights',
  'construction_law',
  'consumer_protection',
  'criminal_defense',
  'dui_and_dwi',
  'education_law',
  'elder_law',
  'employment_and_labor',
  'entertainment_media_and_sports_law',
  'environmental_and_energy_law',
  'estate_planning_and_probate',
  'family_law',
  'general_practice',
  'government_and_administrative_law',
  'health_care_law',
  'immigration',
  'insurance_law',
  'intellectual_property',
  'international_and_cross_border_law',
  'landlord_and_tenant',
  'legal_malpractice',
  'medical_malpractice',
  'native_american_and_tribal_law',
  'nonprofit_and_religious_organizations',
  'personal_injury',
  'real_estate',
  'securities_and_financial_law',
  'social_security_disability',
  'tax_law',
  'technology_privacy_and_cyber_law',
  'traffic_tickets',
  'traffic_tickets.cdl_violations',
  'veterans_and_military',
  'workers_compensation',
};

/// Owner 2026-09-30: our default photo for a practice, shown full-bleed at
/// the bottom of feed cards (a post without photos, every case card — a
/// client's own case photos stay private until a bid is accepted). The
/// leaf photo wins over the category one; without either, a navy panel
/// with the gold practice glyph.
class PracticePhoto extends StatelessWidget {
  const PracticePhoto({
    required this.categoryCode,
    this.practiceCode,
    this.seed,
    super.key,
  });

  final String? categoryCode;
  final String? practiceCode;

  /// Owner 2026-10-04: a case id. Each practice may have up to
  /// [kPracticePhotoVariants] photos (`<code>.jpg`, `<code>_2.jpg`,
  /// `<code>_3.jpg`); the id picks one so the feed does not repeat the
  /// same picture. A variant not bundled falls back to `<code>.jpg`.
  final String? seed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final artKey = [practiceCode, categoryCode].firstWhere(
      (c) => c != null && kPracticeArtAssets.contains(c),
      orElse: () => null,
    );
    // Owner 2026-10-05: without a photo, a calm brand pattern with a
    // small gold medallion — no giant glyph on flat navy.
    final panel = Stack(
      fit: StackFit.expand,
      children: [
        BrandPattern(seed: seed),
        LayoutBuilder(
          builder: (context, box) {
            final side = box.biggest.shortestSide.isFinite
                ? box.biggest.shortestSide
                : 160.0;
            final disc = math.min<double>(math.max(side * 0.3, 28), 64);
            return Center(
              child: Container(
                width: disc,
                height: disc,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      colors.gold.withValues(alpha: 0.22),
                      colors.gold.withValues(alpha: 0.04),
                    ],
                  ),
                  border: Border.all(
                    color: colors.gold.withValues(alpha: 0.8),
                    width: 1.2,
                  ),
                ),
                child: Center(
                  child: AppIcon(
                    practiceGlyph(categoryCode),
                    size: disc * 0.48,
                    color: colors.goldLight,
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
    return ExcludeSemantics(
      child: artKey == null ? panel : _variant(artKey, panel),
    );
  }

  Widget _variant(String artKey, Widget panel) {
    Widget base() => Image.asset(
          'assets/practice_art/$artKey.jpg',
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => panel,
        );
    final n = seed == null ? 0 : practicePhotoVariant(seed!);
    if (n == 0) return base();
    return Image.asset(
      'assets/practice_art/${artKey}_${n + 1}.jpg',
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => base(),
    );
  }
}

/// Photos per practice (the base one plus `_2`, `_3`).
const int kPracticePhotoVariants = 3;

/// FNV-1a over the id: the same case shows the same photo on every device.
int practicePhotoVariant(String seed) {
  var h = 0x811c9dc5;
  for (final c in seed.codeUnits) {
    h = ((h ^ c) * 0x01000193) & 0xffffffff;
  }
  return h % kPracticePhotoVariants;
}
