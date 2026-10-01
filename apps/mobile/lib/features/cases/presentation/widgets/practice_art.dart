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
              child: AppIcon(
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
        child: AppIcon(
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
