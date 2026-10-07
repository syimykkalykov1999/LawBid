import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/presentation/demo_actions.dart';

/// Owner 2026-10-05 (docs/ops/demo-world.md): the top card of Settings while
/// in a demo account — «Вы в демо-аккаунте», «Выйти из демо», «Сменить
/// демо-аккаунт» (partners only: back to the real account and straight to
/// the partner screen's demo section), «Показать плашку» when the banner
/// is hidden. Renders nothing outside demo.
class DemoSettingsCard extends ConsumerWidget {
  const DemoSettingsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(isDemoSessionProvider)) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ui = ref.watch(demoSessionControllerProvider);

    Future<void> switchAccount() async {
      final restored =
          await ref.read(demoSessionControllerProvider.notifier).exitDemo();
      if (restored) await awaitCurrentUser(ref);
      if (!context.mounted) return;
      if (restored) {
        context.go(AppRoutes.partner);
      } else {
        await exitDemoAndGo(context, ref);
      }
    }

    return Container(
      key: const ValueKey('settings-demo-card'),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.goldStroke),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIcon(AppIcons.warningAmberRounded, color: colors.goldDark),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t('demo.settings.title'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('demo.settings.body'),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            key: const ValueKey('settings-demo-exit'),
            label: t.t('demo.exit'),
            icon: AppIcons.logoutRounded,
            isLoading: ui.busy,
            onPressed: ui.busy ? null : () => exitDemoAndGo(context, ref),
          ),
          if (ui.hasRealSession) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('settings-demo-switch'),
              label: t.t('demo.switch'),
              icon: AppIcons.groupsOutlined,
              variant: AppButtonVariant.secondary,
              isEnabled: !ui.busy,
              onPressed: switchAccount,
            ),
          ],
          if (ui.bannerHidden)
            TextButton(
              key: const ValueKey('settings-demo-show-banner'),
              onPressed: () =>
                  ref.read(demoSessionControllerProvider.notifier).showBanner(),
              child: Text(
                t.t('demo.banner.show'),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: type.body.copyWith(color: colors.goldDark),
              ),
            ),
        ],
      ),
    );
  }
}
