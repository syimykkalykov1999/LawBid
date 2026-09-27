import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Stage 1.5 stub (file 01 §15). Real content (Мои кейсы/биды, Сохранённое)
/// is file 4.
///
/// Stage 1.7 mobile — §11 guard row "attorney + unverified → главное меню
/// доступно, вкладка «Кейсы» показывает экран верификации": an attorney
/// whose access token says `verified: false` sees the verification CTA
/// here instead of the (future) cases list.
class MineScreen extends ConsumerWidget {
  const MineScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final role = ref.watch(currentUserRoleProvider);
    final verified = ref.watch(sessionControllerProvider.select((s) => s?.verified ?? false));
    final needsVerification = role == UserRole.attorney && !verified;

    return Scaffold(
      appBar: AppTopBar(title: Text(t.t('mine.stub.title'))),
      body: needsVerification
          ? AppEmptyState(
              icon: Icons.verified_user_outlined,
              title: t.t('mine.verification.title'),
              message: t.t('mine.verification.body'),
              action: SizedBox(
                width: AppSizes.stateActionWidth,
                child: AppButton(
                  label: t.t('onboarding.verification.verifyNow'),
                  height: AppSizes.touchTarget,
                  onPressed: () => context.push(AppRoutes.verification),
                ),
              ),
            )
          : AppEmptyState(
              icon: Icons.folder_open_rounded,
              message: t.t('empty.default.message'),
            ),
    );
  }
}
