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
      'traffic_tickets' => Icons.directions_car_filled_rounded,
      'dui_and_dwi' => Icons.local_police_rounded,
      'criminal_defense' => Icons.gavel_rounded,
      'family_law' => Icons.family_restroom_rounded,
      'immigration' => Icons.flight_takeoff_rounded,
      'personal_injury' => Icons.personal_injury_rounded,
      'medical_malpractice' => Icons.medical_services_rounded,
      'workers_compensation' => Icons.engineering_rounded,
      'estate_planning_and_probate' => Icons.history_edu_rounded,
      'elder_law' => Icons.elderly_rounded,
      'real_estate' => Icons.home_work_rounded,
      'landlord_and_tenant' => Icons.apartment_rounded,
      'employment_and_labor' => Icons.work_rounded,
      'bankruptcy_and_debt' => Icons.account_balance_wallet_rounded,
      'business_and_corporate' => Icons.business_center_rounded,
      'intellectual_property' => Icons.lightbulb_rounded,
      'tax_law' => Icons.receipt_long_rounded,
      'consumer_protection' => Icons.shield_rounded,
      'insurance_law' => Icons.health_and_safety_rounded,
      'veterans_and_military' => Icons.military_tech_rounded,
      'civil_rights' => Icons.diversity_3_rounded,
      'education_law' => Icons.school_rounded,
      'construction_law' => Icons.construction_rounded,
      'environmental_and_energy_law' => Icons.eco_rounded,
      'technology_privacy_and_cyber_law' => Icons.security_rounded,
      'aviation_and_maritime_law' => Icons.sailing_rounded,
      'animal_law' => Icons.pets_rounded,
      _ => Icons.balance_rounded,
    };

/// Bundled photo art (owner-supplied / licensed images), keyed by a leaf
/// practice code (`traffic_tickets.cdl_violations`) or a category code
/// (`family_law`); the leaf wins. Keep in sync with `assets/practice_art/`.
const Set<String> kPracticeArtAssets = {
  'family_law',
  'immigration',
  'criminal_defense',
  'traffic_tickets',
  'dui_and_dwi',
};

/// The art layer: fills its box, fades to transparent towards the left.
class PracticeArt extends StatelessWidget {
  const PracticeArt({
    required this.categoryCode,
    this.practiceCode,
    this.imageUrl,
    super.key,
  });

  final String? categoryCode;

  /// The leaf practice (owner 2026-09-30: a CDL case shows a truck, not
  /// the generic traffic art).
  final String? practiceCode;

  /// A network image (e.g. a post's first photo) wins over the category art.
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final artKey = [practiceCode, categoryCode].firstWhere(
        (c) => c != null && kPracticeArtAssets.contains(c),
        orElse: () => null);
    final asset = artKey == null ? null : 'assets/practice_art/$artKey.jpg';

    Widget fallback() => Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0.55, -0.1),
                  radius: 0.9,
                  colors: [
                    colors.gold.withValues(alpha: dark ? 0.22 : 0.18),
                    colors.gold.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
            Align(
              alignment: const Alignment(0.55, 0),
              child: Icon(
                practiceGlyph(categoryCode),
                size: 120,
                color: colors.gold.withValues(alpha: dark ? 0.22 : 0.20),
              ),
            ),
          ],
        );

    final Widget picture = imageUrl != null
        ? Image.network(
            imageUrl!,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => fallback(),
          )
        : asset != null
            ? Image.asset(asset,
                fit: BoxFit.cover, errorBuilder: (_, __, ___) => fallback())
            : fallback();

    // Fade: transparent at the text side, visible at the right edge.
    return ExcludeSemantics(
      child: ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (rect) => LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: dark ? 0.55 : 0.75),
            Colors.white.withValues(alpha: dark ? 0.8 : 0.95),
          ],
          stops: const [0, 0.55, 1],
        ).createShader(rect),
        child: picture,
      ),
    );
  }
}

/// Owner 2026-09-30: our default photo for a practice, shown full-bleed at
/// the bottom of feed cards (a post without photos, every case card — a
/// client's own case photos stay private until a bid is accepted). The
/// leaf photo wins over the category one; without either, a navy panel
/// with the gold practice glyph.
class PracticePhoto extends StatelessWidget {
  const PracticePhoto({
    required this.categoryCode,
    this.practiceCode,
    super.key,
  });

  final String? categoryCode;
  final String? practiceCode;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final artKey = [practiceCode, categoryCode].firstWhere(
        (c) => c != null && kPracticeArtAssets.contains(c),
        orElse: () => null);
    final panel = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [colors.navy, colors.navy.withValues(alpha: 0.85)],
        ),
      ),
      child: Center(
        child: Icon(
          practiceGlyph(categoryCode),
          size: 72,
          color: colors.goldLight,
        ),
      ),
    );
    return ExcludeSemantics(
      child: artKey == null
          ? panel
          : Image.asset(
              'assets/practice_art/$artKey.jpg',
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => panel,
            ),
    );
  }
}
