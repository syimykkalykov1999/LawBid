import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// `/verification` — "Пройти верификацию сейчас" target (docs/01_
/// FOUNDATION_AUTH.md §11 Шаг 4B). The real license + identity flow is
/// file 03 (TODO(file 03 §verification): replace this placeholder with the
/// verification wizard); until then this explains what's coming and goes
/// back.
class VerificationPlaceholderScreen extends ConsumerWidget {
  const VerificationPlaceholderScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('verification.placeholder.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: AppEmptyState(
        icon: Icons.verified_user_outlined,
        title: t.t('verification.placeholder.heading'),
        message: t.t('verification.placeholder.body'),
        action: SizedBox(
          width: AppSizes.stateActionWidth,
          child: AppButton(
            label: t.t('common.back'),
            variant: AppButtonVariant.secondary,
            height: AppSizes.touchTarget,
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ),
      ),
    );
  }
}
