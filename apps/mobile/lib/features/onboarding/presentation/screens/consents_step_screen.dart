import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/consent_check_tile.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';

/// `/onboarding/consents` — «Возраст и согласия» (docs/01_FOUNDATION_AUTH
/// .md §10.2 H): 18+ (required), Terms + Privacy (required, linked to the
/// current documents from `/config/bootstrap`), the separate required
/// disclaimer, and optional marketing email / push / analytics.
///
/// Per file 07 §4 the Continue button stays active; tapping it with a
/// required box unchecked highlights exactly which ones instead of
/// silently doing nothing.
class ConsentsStepScreen extends ConsumerStatefulWidget {
  const ConsentsStepScreen({super.key});

  @override
  ConsumerState<ConsentsStepScreen> createState() => _ConsentsStepScreenState();
}

class _ConsentsStepScreenState extends ConsumerState<ConsentsStepScreen> {
  final Map<ConsentType, bool> _values = {for (final c in ConsentType.values) c: false};
  bool _attempted = false;

  bool get _requiredOk => ConsentType.requiredTypes.every((c) => _values[c]!);

  void _set(ConsentType type, bool value) => setState(() => _values[type] = value);

  void _setTermsAndPrivacy(bool value) => setState(() {
        _values[ConsentType.terms] = value;
        _values[ConsentType.privacy] = value;
      });

  Future<void> _continue() async {
    setState(() => _attempted = true);
    if (!_requiredOk) return;
    await ref.read(onboardingActionsProvider.notifier).saveConsents(_values);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final action = ref.watch(onboardingActionsProvider);

    bool missing(ConsentType c) => _attempted && !_values[c]!;
    final termsAccepted = _values[ConsentType.terms]! && _values[ConsentType.privacy]!;

    Widget label(String text) => Text(text, style: typography.body.copyWith(color: colors.text));

    return OnboardingScaffold(
      step: OnboardingStepId.consents,
      title: t.t('onboarding.consents.title'),
      subtitle: t.t('onboarding.consents.subtitle'),
      onBack: () => context.go(OnboardingRoutes.forStep(OnboardingStepId.language)),
      error: action.error,
      primaryLabel: t.t('onboarding.continue'),
      primaryLoading: action.busy,
      onPrimary: _continue,
      footnote: _attempted && !_requiredOk ? t.t('onboarding.consents.requiredHint') : null,
      children: [
        StepSectionLabel(t.t('onboarding.consents.section.required')),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
          child: Column(
            children: [
              ConsentCheckTile(
                value: _values[ConsentType.age18]!,
                showError: missing(ConsentType.age18),
                semanticLabel: t.t('onboarding.consents.age18'),
                onChanged: (v) => _set(ConsentType.age18, v),
                content: label(t.t('onboarding.consents.age18')),
              ),
              ConsentCheckTile(
                value: termsAccepted,
                showError: missing(ConsentType.terms),
                semanticLabel: t.t('onboarding.consents.terms'),
                onChanged: _setTermsAndPrivacy,
                content: label(t.t('onboarding.consents.terms')),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final doc in const ['terms', 'privacy', 'disclaimer'])
              AppChip(
                label: t.t('legal.doc.$doc'),
                leading: Icon(Icons.description_outlined, size: AppSizes.iconSm, color: colors.gold),
                onTap: () => context.push(AppRoutes.legalDoc(doc)),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        _DisclaimerCard(
          title: t.t('onboarding.consents.disclaimer.title'),
          body: t.t('onboarding.consents.disclaimer.body'),
          child: ConsentCheckTile(
            value: _values[ConsentType.disclaimer]!,
            showError: missing(ConsentType.disclaimer),
            semanticLabel: t.t('onboarding.consents.disclaimer.accept'),
            onChanged: (v) => _set(ConsentType.disclaimer, v),
            content: label(t.t('onboarding.consents.disclaimer.accept')),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        StepSectionLabel(t.t('onboarding.consents.section.optional')),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
          child: Column(
            children: [
              for (final c in const [
                ConsentType.marketingEmail,
                ConsentType.marketingPush,
                ConsentType.analytics,
              ])
                ConsentCheckTile(
                  value: _values[c]!,
                  semanticLabel: t.t('onboarding.consents.${c.name}'),
                  onChanged: (v) => _set(c, v),
                  content: label(t.t('onboarding.consents.${c.name}')),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// §10.2 H "Отдельный обязательный дисклеймер" — visually distinct so it
/// isn't skimmed past with the checkboxes above.
class _DisclaimerCard extends StatelessWidget {
  const _DisclaimerCard({required this.title, required this.body, required this.child});

  final String title;
  final String body;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.md, AppSpacing.xs),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.gold.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.balance_rounded, size: AppSizes.iconSm, color: colors.goldDark),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(title, style: typography.roleTitle.copyWith(color: colors.text)),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(body, style: typography.bodySmall.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.xs),
          child,
        ],
      ),
    );
  }
}
