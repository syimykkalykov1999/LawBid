import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/l10n_providers.dart';
import '../../application/onboarding_flow.dart';
import '../../auth_routes.dart';

/// `/welcome` (file 07 §6.1). Layout, 2026-09-22 revision (owner request,
/// this conversation, after seeing it run on-device): title text first,
/// THEN the scales logo below it (was logo-then-title), and the logo
/// enlarged to `size: 300` (the design doc's stated ceiling, §5.1) to fill
/// the empty space that was visible between the title and the phone button
/// on a real device. Order: title → scales logo → phone button → 3 social
/// icons → legal fine print.
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

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
          child: Column(
            children: [
              const SizedBox(height: 54),
              Text(
                t.t('auth.welcome.title'),
                textAlign: TextAlign.center,
                style: typography.titleWelcome.copyWith(color: colors.text),
              ),
              const SizedBox(height: 35),
              const ScalesLogo(size: 300, animated: true, semanticLabel: 'LawBid'),
              const SizedBox(height: 16),
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
              const SizedBox(height: 16),
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
  }
}
