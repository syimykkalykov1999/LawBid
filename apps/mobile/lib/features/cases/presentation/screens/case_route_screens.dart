import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// `/case/:id` (the `lawbid.app/case/:id` deep link, docs/01 §12): the
/// owner sees their case, an attorney the attorney view (§4.3).
class CaseRouteScreen extends ConsumerWidget {
  const CaseRouteScreen({required this.caseId, super.key});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      ref.watch(currentUserRoleProvider) == UserRole.client
          ? OwnerCaseScreen(caseId: caseId)
          : AttorneyCaseScreen(caseId: caseId);
}

/// docs/04 §2: without an active subscription/trial "Сделать бид" and
/// "Написать клиенту" lead to the subscription screen. The paywall and
/// trial are docs/06 (stage 6.7); this is its call-to-action entry.
class SubscriptionRequiredScreen extends ConsumerWidget {
  const SubscriptionRequiredScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
            semanticLabel: t.t('common.back'), onPressed: () => context.pop()),
      ),
      body: AppStateLayout(
        icon: Icons.workspace_premium_outlined,
        title: t.t('cases.subscription.title'),
        message: t.t('cases.subscription.message'),
        action: AppButton(
          label: t.t('common.close'),
          variant: AppButtonVariant.secondary,
          height: AppSizes.touchTarget,
          onPressed: () => context.pop(),
        ),
      ),
    );
  }
}
