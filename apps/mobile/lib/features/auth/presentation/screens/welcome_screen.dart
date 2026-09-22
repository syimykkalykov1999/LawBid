import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/l10n_providers.dart';
import '../../../../core/l10n/widgets/language_picker_sheet.dart';
import '../../application/onboarding_flow.dart';
import '../../auth_routes.dart';

/// `/welcome` (file 07 §6.1). Layout, 2026-09-22 revision (owner request,
/// this conversation, after seeing it run on-device): title text first,
/// THEN the scales logo below it (was logo-then-title). The logo itself
/// stays at its original `size: 236` — only its stand/base is stretched
/// (`standExtension`, see scales_logo.dart) so the topper/beam/pans don't
/// change proportions. The legal fine print is pinned to the very bottom
/// of the screen (LayoutBuilder + Spacer, see build() below) rather than
/// just following the content, since the owner found the bottom of the
/// screen felt empty on a real device. Order: title → scales logo → phone
/// button → 3 social icons → (flexible space) → legal fine print.
///
/// Fixed header row above the scrollable content (owner request, same
/// conversation): a theme toggle icon button top-left and a language
/// toggle icon button top-right — NOT in file 07 §10.2's spec for this
/// screen (which only calls for a small language-switcher link, no theme
/// control here at all), but an explicit owner override, given after
/// seeing the app run for real. Icon-only (day/night glyph, globe glyph,
/// no visible text label — 2026-09-22 owner follow-up); [AppIconButton]
/// carries the a11y label via `semanticLabel` instead. The globe icon no
/// longer toggles ru<->en directly (2026-09-22 owner follow-up, second
/// voice message) — it opens [LanguagePickerSheet] (search field + list,
/// most-popular-first), which today only lets you actually pick `ru`/`en`
/// (see `language_catalog.dart`) ahead of stage 1.6's real i18n system —
/// see core/l10n/static_translator.dart's doc comment.
///
/// The phone/social-button block is centered (two [Spacer]s, not fixed
/// gaps) between the logo and the legal fine print, on both themes
/// (2026-09-22 owner follow-up).
///
/// The scales logo's stand/beam/pan-outline stays the default gold
/// stroke in BOTH themes. An earlier pass here wrongly overrode it to
/// navy in light theme; reverted per owner correction — only the
/// pan/bowl fill was meant to pick up the button's color, and
/// [AppColorTokens.panFill] in light theme is already `#0A1A3F`, the
/// same navy as the phone button's fill (`AppColorsLight.accent`), so no
/// code change was needed there — just removing the stroke override that
/// had made the whole logo read as one flat navy shape instead of gold
/// lines around navy/gold pans.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);

    void showNotBuiltYet() {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(t.t('auth.welcome.notBuiltYet'))),
      );
    }

    // Legal-document screens (Terms/Privacy) are out of scope for this
    // stage-1.7 "screens" slice — served from file 06's legal-document
    // bootstrap config, not yet built. Same "not built yet" affordance as
    // the social buttons rather than a silently-dead link.
    void showLegalDocNotBuiltYet() {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(t.t('auth.welcome.notBuiltYet'))),
      );
    }

    final themeMode = ref.watch(themeModeControllerProvider).value ?? ThemeMode.system;
    final isDark = themeMode == ThemeMode.dark ||
        (themeMode == ThemeMode.system &&
            MediaQuery.platformBrightnessOf(context) == Brightness.dark);

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
                vertical: 8,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  AppIconButton(
                    icon: Icon(isDark ? Icons.dark_mode_outlined : Icons.light_mode_outlined),
                    semanticLabel: t.t('theme.toggle.label'),
                    onPressed: () {
                      ref
                          .read(themeModeControllerProvider.notifier)
                          .setThemeMode(isDark ? ThemeMode.light : ThemeMode.dark);
                    },
                  ),
                  AppIconButton(
                    icon: const Icon(Icons.language),
                    semanticLabel: t.t('lang.toggle.label'),
                    onPressed: () => LanguagePickerSheet.show(context),
                  ),
                ],
              ),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minHeight: constraints.maxHeight),
                      child: IntrinsicHeight(
                        child: Column(
                          children: [
                      const SizedBox(height: 54),
                      Text(
                        t.t('auth.welcome.title'),
                        textAlign: TextAlign.center,
                        style: typography.titleWelcome.copyWith(color: colors.text),
                      ),
                      const SizedBox(height: 35),
                      const ScalesLogo(
                        size: 236,
                        animated: true,
                        semanticLabel: 'LawBid',
                        standExtension: 50,
                      ),
                      // Flexible, not fixed (owner request, 2026-09-22:
                      // center the phone/social buttons between the logo
                      // and the legal text) -- paired with the second
                      // Spacer further down, so this block sits mid-way in
                      // whatever room is left, on both themes.
                      const Spacer(),
                      GavelStrikeButton(
                        label: t.t('auth.welcome.phone'),
                        icon: Icons.call,
                        height: 48,
                        onPressed: () {
                          ref.read(onboardingFlowProvider.notifier).goToPhoneStep();
                          context.push(AuthRoutes.phone);
                        },
                      ),
                      const SizedBox(height: 8),
                      // file 07 §7.4: the gavel-strike animation applies to these
                      // three social-login buttons too, not just "Продолжить с
                      // телефоном" — GavelStrikeIconButton (added in stage 1.7,
                      // docs/CHANGELOG.md, see gavel_strike_icon_button.dart).
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Expanded(
                            child: GavelStrikeIconButton(
                              icon: const EmailGlyph(),
                              semanticLabel: t.t('auth.welcome.email'),
                              onPressed: showNotBuiltYet,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: GavelStrikeIconButton(
                              icon: const AppleGlyph(),
                              semanticLabel: t.t('auth.welcome.apple'),
                              onPressed: showNotBuiltYet,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: GavelStrikeIconButton(
                              icon: const GoogleGlyph(),
                              semanticLabel: t.t('auth.welcome.google'),
                              onPressed: showNotBuiltYet,
                            ),
                          ),
                        ],
                      ),
                      // Second flexible spacer (see the one above the phone
                      // button): the pair centers the button block between the
                      // logo and the legal text, while still pinning the legal
                      // text flush to the bottom on tall screens and scrolling
                      // normally (no overflow) on short ones -- see the
                      // LayoutBuilder/ConstrainedBox/IntrinsicHeight setup above,
                      // the standard Flutter idiom for pinning to the bottom of a
                      // Column that must also remain scrollable.
                      const Spacer(),
                      LegalText(
                        text: t.t('auth.welcome.legal'),
                        links: {
                          t.t('auth.welcome.legal.terms'): showLegalDocNotBuiltYet,
                          t.t('auth.welcome.legal.privacy'): showLegalDocNotBuiltYet,
                        },
                        style: typography.legalFine,
                      ),
                      const SizedBox(height: AppSpacing.lg),
                    ],
                  ),
                ),
              ),
            );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
