import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

/// Why an attorney sees the "Complete verification" gate.
enum VerificationGateReason { cases, post }

/// "Complete verification" (docs/03 §1, §6.4, §11 stage 3.9 gates): shown
/// to unverified / pending / rejected attorneys on the Cases tab and on
/// "+" → Post to feed. The CTA opens the verification status screen
/// (`/verification`, filled by stage 3.8).
class VerificationRequiredView extends ConsumerWidget {
  const VerificationRequiredView({required this.reason, super.key});

  final VerificationGateReason reason;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return AppEmptyState(
      key: const ValueKey('verification-required'),
      icon: Icons.verified_user_outlined,
      title: t.t('gate.verify.title'),
      message: t.t(reason == VerificationGateReason.post ? 'gate.verify.post' : 'gate.verify.cases'),
      action: AppButton(
        label: t.t('gate.verify.cta'),
        height: AppSizes.touchTarget,
        onPressed: () => context.push(AppRoutes.verification),
      ),
    );
  }
}

/// Full-screen gate for "+" → Post to feed ([AppRoutes.verificationRequired],
/// where AppRouterGuard sends unverified attorneys instead of `/create`).
class VerificationRequiredScreen extends ConsumerWidget {
  const VerificationRequiredScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('gate.verify.postTitle')),
        leading: AppTapTarget(
          child: Semantics(
            button: true,
            label: t.t('common.close'),
            excludeSemantics: true,
            child: AppPressable(
              onTap: () => context.canPop() ? context.pop() : context.go(AppRoutes.feed),
              child: SizedBox.square(
                dimension: AppSizes.touchTarget,
                child: Icon(Icons.close_rounded, color: colors.text, size: AppSizes.iconMd),
              ),
            ),
          ),
        ),
      ),
      body: const VerificationRequiredView(reason: VerificationGateReason.post),
    );
  }
}
