import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';

/// Owner 2026-10-01: the feed header's way into the full-screen reels —
/// nothing at all until reels are switched on (flag + Bunny keys).
class ReelsIconButton extends ConsumerWidget {
  const ReelsIconButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(reelsEnabledProvider)) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: t.t('reels.open'),
      excludeSemantics: true,
      child: AppTapTarget(
        child: AppPressable(
          onTap: () => ReelsScreen.open(context),
          child: SizedBox.square(
            dimension: AppSizes.touchTarget,
            child: Center(
              child: AppIcon(AppIcons.filmReelOutlined,
                  color: colors.text, size: AppSizes.iconMd),
            ),
          ),
        ),
      ),
    );
  }
}
