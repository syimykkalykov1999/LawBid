import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/presentation/demo_actions.dart';

/// Owner 2026-10-05 (docs/ops/demo-world.md): wraps the main shell's body.
/// In a demo session a compact floating banner sits at the top —
/// «Демо-режим · данные ненастоящие» with «Скрыть» and «Выйти» icon
/// buttons. Hidden, it leaves only a 24 px handle in the top-right corner
/// (so a screen recording stays clean) that brings the banner back.
/// Outside demo it is just [child].
class DemoBannerHost extends ConsumerWidget {
  const DemoBannerHost({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDemo = ref.watch(isDemoSessionProvider);
    if (!isDemo) return child;
    final hidden = ref.watch(
      demoSessionControllerProvider.select((s) => s.bannerHidden),
    );
    return Stack(
      children: [
        child,
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: SafeArea(
            bottom: false,
            child: Align(
              alignment: hidden ? Alignment.topRight : Alignment.topCenter,
              child: hidden ? const _Handle() : const _Banner(),
            ),
          ),
        ),
      ],
    );
  }
}

class _Banner extends ConsumerWidget {
  const _Banner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final busy = ref.watch(demoSessionControllerProvider).busy;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.xs,
        AppSpacing.screenSide,
        0,
      ),
      child: Material(
        key: const ValueKey('demo-banner'),
        color: colors.text,
        elevation: 4,
        shadowColor: colors.shadow,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        child: Padding(
          padding: const EdgeInsets.only(left: AppSpacing.md),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(
                AppIcons.warningAmberRounded,
                size: 16,
                color: colors.gold,
              ),
              const SizedBox(width: AppSpacing.sm),
              // The text yields; the two buttons keep their place.
              Flexible(
                child: Text(
                  t.t('demo.banner'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.bg),
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              AppIconButton(
                key: const ValueKey('demo-banner-hide'),
                icon: AppIcon(
                  AppIcons.visibilityOffOutlined,
                  size: 18,
                  color: colors.bg,
                ),
                semanticLabel: t.t('demo.banner.hide'),
                onPressed: () => ref
                    .read(demoSessionControllerProvider.notifier)
                    .hideBanner(),
              ),
              AppIconButton(
                key: const ValueKey('demo-banner-exit'),
                icon: AppIcon(
                  AppIcons.logoutRounded,
                  size: 18,
                  color: colors.gold,
                ),
                semanticLabel: t.t('demo.banner.exit'),
                isLoading: busy,
                onPressed: busy ? null : () => exitDemoAndGo(context, ref),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 24 px corner handle: the only trace of demo while the banner is hidden.
class _Handle extends ConsumerWidget {
  const _Handle();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: t.t('demo.banner.show'),
      child: GestureDetector(
        key: const ValueKey('demo-banner-handle'),
        behavior: HitTestBehavior.opaque,
        onTap: () =>
            ref.read(demoSessionControllerProvider.notifier).showBanner(),
        child: Container(
          width: 24,
          height: 24,
          margin: const EdgeInsets.only(right: AppSpacing.xs),
          decoration: BoxDecoration(
            color: colors.gold.withValues(alpha: 0.35),
            borderRadius: const BorderRadius.vertical(
              bottom: Radius.circular(AppRadii.pill),
            ),
          ),
          alignment: Alignment.center,
          child: Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: colors.gold,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}
