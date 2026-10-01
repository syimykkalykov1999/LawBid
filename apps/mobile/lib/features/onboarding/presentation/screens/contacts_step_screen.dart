import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/contact_verification_card.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';

/// `/onboarding/contacts` (docs/01_FOUNDATION_AUTH.md §11 Шаг 3A/3B):
/// - client: BOTH phone and email must be verified (hard requirement —
///   the guard won't let the user past this step, and the server refuses
///   to complete onboarding with CLIENT_CONTACTS_INCOMPLETE);
/// - attorney: verified phone required, work email recommended (receipts).
///
/// Whatever the user signed in with is already verified and shown as such;
/// the missing one is verified inline. A status pill on each card and the
/// footnote under Continue say exactly what is still missing.
class ContactsStepScreen extends ConsumerStatefulWidget {
  const ContactsStepScreen({super.key});

  @override
  ConsumerState<ContactsStepScreen> createState() => _ContactsStepScreenState();
}

class _ContactsStepScreenState extends ConsumerState<ContactsStepScreen> {
  bool _attempted = false;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final user = ref.watch(currentUserControllerProvider).user;
    final action = ref.watch(onboardingActionsProvider);
    if (user == null) return const SizedBox.shrink();

    final emailRequired = user.isClient;
    final phoneMissing = !user.phoneVerified;
    final emailMissing = emailRequired && !user.emailVerified;
    final missingKeys = [
      if (phoneMissing) 'phone',
      if (emailMissing) 'email',
    ];
    final footnote = missingKeys.isEmpty
        ? null
        : t.t('onboarding.contacts.missing.${missingKeys.join('_')}');

    return OnboardingScaffold(
      step: OnboardingStepId.contacts,
      title: t.t('onboarding.contacts.title'),
      subtitle: t.t(user.isClient
          ? 'onboarding.contacts.subtitle.client'
          : 'onboarding.contacts.subtitle.attorney'),
      onBack: () => context.go(OnboardingRoutes.forStep(OnboardingStepId.role)),
      error: action.error,
      primaryLabel: t.t('onboarding.continue'),
      primaryLoading: action.busy,
      footnote: footnote,
      onPrimary: () {
        if (missingKeys.isNotEmpty) {
          setState(() => _attempted = true);
          return;
        }
        ref
            .read(onboardingActionsProvider.notifier)
            .advance(OnboardingStepId.contacts);
      },
      children: [
        ContactVerificationCard(
          type: ContactType.phone,
          requirement: ContactRequirement.required,
          verifiedValue: user.phoneVerified ? user.phone : null,
          initialValue: user.phoneVerified ? null : user.phone,
          highlightMissing: _attempted && phoneMissing,
        ),
        const SizedBox(height: AppSpacing.md),
        ContactVerificationCard(
          type: ContactType.email,
          requirement: emailRequired
              ? ContactRequirement.required
              : ContactRequirement.recommended,
          verifiedValue: user.emailVerified ? user.email : null,
          initialValue: user.emailVerified ? null : user.email,
          highlightMissing: _attempted && emailMissing,
        ),
        const SizedBox(height: AppSpacing.lg),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppIcon(
              AppIcons.lockOutlineRounded,
              size: AppSizes.iconSm,
              color:
                  Theme.of(context).extension<AppColorTokens>()!.textSecondary,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('onboarding.contacts.privacy'),
                style: Theme.of(context)
                    .extension<AppTypographyTokens>()!
                    .caption
                    .copyWith(
                        color: Theme.of(context)
                            .extension<AppColorTokens>()!
                            .textSecondary),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
