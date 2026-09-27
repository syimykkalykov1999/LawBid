import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/legal_document.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/consent_card.dart';
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
  final Map<ConsentType, bool> _values = {
    for (final c in ConsentType.requiredTypes) c: false
  };
  bool _attempted = false;

  bool get _requiredOk => ConsentType.requiredTypes.every((c) => _values[c]!);

  void _set(ConsentType type, bool value) =>
      setState(() => _values[type] = value);

  void _setTermsAndPrivacy(bool value) => setState(() {
        _values[ConsentType.terms] = value;
        _values[ConsentType.privacy] = value;
      });

  Future<void> _continue() async {
    setState(() => _attempted = true);
    if (!_requiredOk) return;
    // The accepted document versions (bootstrap legal_documents) are sent
    // as documentId for the consents that have a document.
    final docs = ref.read(featureFlagsControllerProvider).legalDocuments;
    final lang = ref.read(languageControllerProvider).value ?? AppLanguage.en;
    String? idOf(String docType) =>
        pickLegalDocument(docs, docType, lang.name)?.id;
    await ref.read(onboardingActionsProvider.notifier).saveConsents(
      _values,
      documentIds: {
        ConsentType.terms: idOf('terms'),
        ConsentType.privacy: idOf('privacy'),
        ConsentType.disclaimer: idOf('disclaimer'),
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final action = ref.watch(onboardingActionsProvider);

    bool missing(ConsentType c) => _attempted && !_values[c]!;
    final termsAccepted =
        _values[ConsentType.terms]! && _values[ConsentType.privacy]!;


    return OnboardingScaffold(
      step: OnboardingStepId.consents,
      title: t.t('onboarding.consents.title'),
      subtitle: t.t('onboarding.consents.subtitle'),
      error: action.error,
      primaryLabel: t.t('onboarding.continue'),
      primaryLoading: action.busy,
      onPrimary: _continue,
      footnote: _attempted && !_requiredOk
          ? t.t('onboarding.consents.requiredHint')
          : null,
      children: [
        // Owner decision 2026-09-27: required consents as role-style
        // cards; optional consents (marketing, analytics) move to
        // Settings later and are not shown or sent here.
        ConsentCard(
          icon: Icons.verified_user_outlined,
          title: t.t('onboarding.consents.age18'),
          description: t.t('onboarding.consents.age18.desc'),
          value: _values[ConsentType.age18]!,
          showError: missing(ConsentType.age18),
          onChanged: (v) => _set(ConsentType.age18, v),
        ),
        const SizedBox(height: AppSpacing.md),
        ConsentCard(
          icon: Icons.gavel_rounded,
          title: t.t('onboarding.consents.terms'),
          description: t.t('onboarding.consents.terms.desc'),
          value: termsAccepted,
          showError: missing(ConsentType.terms),
          onChanged: _setTermsAndPrivacy,
        ),
        const SizedBox(height: AppSpacing.md),
        ConsentCard(
          icon: Icons.balance_rounded,
          title: t.t('onboarding.consents.disclaimer.title'),
          description: t.t('onboarding.consents.disclaimer.body'),
          value: _values[ConsentType.disclaimer]!,
          showError: missing(ConsentType.disclaimer),
          onChanged: (v) => _set(ConsentType.disclaimer, v),
        ),
        const SizedBox(height: AppSpacing.xl),
        StepSectionLabel(t.t('onboarding.consents.docs')),
        LayoutBuilder(
          builder: (context, constraints) {
            final itemWidth = (constraints.maxWidth - AppSpacing.sm) / 2;
            return Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final doc in const ['terms', 'privacy', 'disclaimer'])
                  SizedBox(
                    width: itemWidth,
                    child: _DocLink(
                      label: t.t('legal.doc.$doc'),
                      onTap: () => context.push(AppRoutes.legalDoc(doc)),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// Compact document link for the two-column grid under the cards.
class _DocLink extends StatelessWidget {
  const _DocLink({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      link: true,
      label: label,
      child: AppPressable(
        onTap: onTap,
        child: ExcludeSemantics(
          child: Container(
            constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md, vertical: AppSpacing.sm),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.card),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              children: [
                Icon(Icons.description_outlined,
                    size: AppSizes.iconSm, color: colors.gold),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    label,
                    style: typography.bodySmall.copyWith(color: colors.text),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
