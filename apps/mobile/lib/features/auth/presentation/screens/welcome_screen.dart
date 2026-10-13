// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/config/app_config.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/l10n/widgets/language_picker_sheet.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/theme/theme_picker_sheet.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/features/demo/presentation/demo_code_sheet.dart';

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

    // Phase 3 of the auth networking work (docs/CHANGELOG.md): Apple/
    // Google buttons now drive real native sign-in via
    // `OnboardingFlow.signInWithApple()`/`.signInWithGoogle()`, mirroring
    // `OtpScreen._handleCompleted`'s post-success navigation (read
    // `state.step` after the call resolves and either push the role
    // screen or go straight to the feed). A `false` result with no
    // `errorMessage` means the user cancelled the native sheet — nothing
    // to show, they can just tap again.
    Future<void> handleSocialSignIn(Future<bool> Function() signIn) async {
      final ok = await signIn();
      if (!context.mounted) return;
      if (ok) {
        final step = ref.read(onboardingFlowProvider).step;
        if (step == OnboardingStep.role) {
          // ignore: unawaited_futures
          context.push(AuthRoutes.role);
        } else if (step == OnboardingStep.completed) {
          context.go(AppRoutes.feed);
        }
        return;
      }
      final message = ref.read(onboardingFlowProvider).errorMessage;
      if (message != null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      }
    }

    final flowState = ref.watch(onboardingFlowProvider);
    final chosenTheme = ref.watch(appThemeControllerProvider);
    // Login-method flag gating (docs/01_FOUNDATION_AUTH.md §15 "Этап 1.8":
    // starter flags include phone_login/email_login/apple_login/
    // google_login — the exact four methods this screen offers, per
    // §10.1's own list). A disabled method's button is simply omitted
    // from layout, not disabled-but-visible — there is no spec text
    // calling for a "coming soon" state here, unlike the email button's
    // pre-existing "not built yet" stub (that one stays as-is regardless
    // of email_login: it has no real handler to gate yet either way).
    final flags = ref.watch(featureFlagsControllerProvider);
    final phoneLoginEnabled = flags.isEnabled('phone_login');
    // Store release 2026-10-06: a release build hides a social button this
    // build cannot complete (store reviewers reject a button that only
    // shows an error). Debug/tests keep showing it so a missing id is
    // noticed during development.
    final platform = Theme.of(context).platform;
    final appleLoginEnabled = flags.isEnabled('apple_login') &&
        (!kReleaseMode || AppConfig.appleSignInSupported(platform));
    final googleLoginEnabled = flags.isEnabled('google_login') &&
        (!kReleaseMode || AppConfig.googleSignInConfigured(platform));
    // The icon shows the current theme's mood: a moon in a dark one.
    final isDark = (chosenTheme == null
            ? MediaQuery.platformBrightnessOf(context)
            : AppThemes.of(chosenTheme).brightness) ==
        Brightness.dark;

    // Same flag-gating as the phone button below, applied to the 3 icon
    // buttons: an Expanded widget for each ENABLED method only, so a
    // disabled one doesn't leave a dead gap in the row — the remaining
    // buttons simply share it. A gap SizedBox is inserted only between
    // two buttons that are both actually present.
    final iconButtons = <Widget>[
      if (flags.isEnabled('email_login'))
        Expanded(
          child: GavelStrikeIconButton(
            icon: const EmailGlyph(),
            semanticLabel: t.t('auth.welcome.email'),
            onPressed: () => context.push(AuthRoutes.email),
          ),
        ),
      if (appleLoginEnabled)
        Expanded(
          child: GavelStrikeIconButton(
            icon: const AppleGlyph(),
            semanticLabel: t.t('auth.welcome.apple'),
            isLoading: flowState.isSubmitting,
            onPressed: () => handleSocialSignIn(
              () => ref.read(onboardingFlowProvider.notifier).signInWithApple(),
            ),
          ),
        ),
      if (googleLoginEnabled)
        Expanded(
          child: GavelStrikeIconButton(
            icon: const GoogleGlyph(),
            semanticLabel: t.t('auth.welcome.google'),
            isLoading: flowState.isSubmitting,
            onPressed: () => handleSocialSignIn(
              () =>
                  ref.read(onboardingFlowProvider.notifier).signInWithGoogle(),
            ),
          ),
        ),
    ];
    final spacedIconButtons = <Widget>[];
    for (var i = 0; i < iconButtons.length; i++) {
      if (i > 0) spacedIconButtons.add(const SizedBox(width: 8));
      spacedIconButtons.add(iconButtons[i]);
    }
    final socialLoginRow = spacedIconButtons.isEmpty
        ? const SizedBox.shrink()
        : Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: spacedIconButtons,
          );

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
                    plain: false,
                    icon: AppIcon(
                      isDark
                          ? AppIcons.darkModeOutlined
                          : AppIcons.lightModeOutlined,
                    ),
                    semanticLabel: t.t('theme.toggle.label'),
                    onPressed: () => ThemePickerSheet.show(context),
                  ),
                  AppIconButton(
                    plain: false,
                    icon: const AppIcon(AppIcons.language),
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenSide,
                    ),
                    child: ConstrainedBox(
                      constraints:
                          BoxConstraints(minHeight: constraints.maxHeight),
                      child: SizedBox(
                        height: constraints.maxHeight < 480
                            ? 480
                            : constraints.maxHeight,
                        child: Column(
                          children: [
                            const SizedBox(height: 20),
                            Text(
                              t.t('auth.welcome.title'),
                              textAlign: TextAlign.center,
                              style: typography.titleWelcome
                                  .copyWith(color: colors.text),
                            ),
                            const SizedBox(height: 16),
                            // The logo takes all the room the bottom block leaves
                            // (so a missing demo link never leaves a hole); it
                            // scales as a whole, proportions kept.
                            Expanded(
                              child: Padding(
                                padding:
                                    const EdgeInsets.only(top: 6, bottom: 24),
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: ScalesLogo(
                                    size: 190,
                                    animated: true,
                                    standExtension: 44,
                                  ),
                                ),
                              ),
                            ),
                            if (phoneLoginEnabled) ...[
                              GavelStrikeButton(
                                label: t.t('auth.welcome.phone'),
                                icon: AppIcons.call,
                                height: 40,
                                // Brighter in dark theme only (owner follow-up,
                                // 2026-09-22): gold read too dull here. Every
                                // other primary button keeps the default variant.
                                variant: isDark
                                    ? AppButtonVariant.ctaBright
                                    : AppButtonVariant.primary,
                                onPressed: () {
                                  ref
                                      .read(onboardingFlowProvider.notifier)
                                      .goToPhoneStep();
                                  context.push(AuthRoutes.phone);
                                },
                              ),
                              const SizedBox(height: 8),
                            ],
                            // file 07 §7.4: the gavel-strike animation applies to these
                            // three social-login buttons too, not just "Продолжить с
                            // телефоном" — GavelStrikeIconButton (added in stage 1.7,
                            // docs/CHANGELOG.md, see gavel_strike_icon_button.dart).
                            socialLoginRow,
                            // The links below belong to the bottom block,
                            // not to the buttons.
                            const SizedBox(height: 18),
                            // Owner 2026-10-13: signing in again needs no SMS —
                            // phone number or e-mail + password.
                            TextButton(
                              key: const ValueKey('welcome-login'),
                              style: TextButton.styleFrom(
                                minimumSize: const Size(0, 28),
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 4,
                                ),
                              ),
                              onPressed: () => context.push(AuthRoutes.login),
                              child: Text(
                                t.t('auth.login.entry'),
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: typography.body.copyWith(
                                  color: colors.text,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            // Owner 2026-10-04: assistants come in with the
                            // attorney's one-time code (no SMS).
                            TextButton(
                              key: const ValueKey('welcome-assistant'),
                              style: TextButton.styleFrom(
                                minimumSize: const Size(0, 28),
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 4,
                                ),
                              ),
                              onPressed: () =>
                                  context.push(AuthRoutes.assistant),
                              child: Text(
                                t.t('assistant.code.entry'),
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: typography.body.copyWith(
                                  color: colors.textSecondary,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                            // Owner 2026-10-05 (docs/ops/demo-world.md): a blogger
                            // enters the demo with the admin's 8-character code.
                            if (ref
                                .watch(featureFlagsControllerProvider)
                                .isEnabled('demo_code_login'))
                              TextButton(
                                key: const ValueKey('welcome-demo-code'),
                                style: TextButton.styleFrom(
                                  minimumSize: const Size(0, 28),
                                  tapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 4,
                                  ),
                                ),
                                onPressed: () => DemoCodeSheet.show(context),
                                child: Text(
                                  t.t('demo.code.entry'),
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: typography.caption.copyWith(
                                    color: colors.textSecondary,
                                    decoration: TextDecoration.underline,
                                  ),
                                ),
                              ),
                            // Second flexible spacer (see the one above the phone
                            // button): the pair centers the button block between the
                            // logo and the legal text, while still pinning the legal
                            // text flush to the bottom on tall screens and scrolling
                            // normally (no overflow) on short ones -- see the
                            // LayoutBuilder/ConstrainedBox/IntrinsicHeight setup above,
                            // the standard Flutter idiom for pinning to the bottom of a
                            // Column that must also remain scrollable.
                            const SizedBox(height: 8),
                            LegalText(
                              // Only the acceptance sentence: the third line of
                              // the bottom block.
                              text: _acceptLine(t),
                              links: {
                                t.t('auth.welcome.legal.terms'): () =>
                                    context.push(AppRoutes.legalDoc('terms')),
                                t.t('auth.welcome.legal.privacy'): () =>
                                    context.push(AppRoutes.legalDoc('privacy')),
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

/// The sentence of [full] that holds the [termsLabel] link ("By continuing,
/// you accept the Terms and Privacy Policy.").
String _acceptSentence(String full, String termsLabel) {
  final at = full.indexOf(termsLabel);
  if (at <= 0) return full;
  var start = 0;
  for (final m in RegExp(r'[.!?。！？।۔]\s*').allMatches(full.substring(0, at))) {
    start = m.end;
  }
  return full.substring(start);
}

/// «By continuing, you accept the {terms} and {privacy}» — its own key;
/// languages still without it fall back to the last sentence of the long one.
String _acceptLine(Translator t) {
  final terms = t.t('auth.welcome.legal.terms');
  final privacy = t.t('auth.welcome.legal.privacy');
  final line = t.t('welcome.acceptLine', {'terms': terms, 'privacy': privacy});
  if (line != 'welcome.acceptLine' && line.contains(terms)) return line;
  return _acceptSentence(t.t('auth.welcome.legal'), terms);
}
