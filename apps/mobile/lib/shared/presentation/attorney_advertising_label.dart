import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Owner 2026-10-22 (audit #4 §5, NY Rule 7.1(f)): the «Attorney
/// Advertising» line on an attorney profile, shown when the server says the
/// attorney is licensed in a state that requires it. Posts carry the same
/// words in their header subtitle.
class AttorneyAdvertisingLabel extends ConsumerWidget {
  const AttorneyAdvertisingLabel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      key: const ValueKey('attorney-advertising-label'),
      mainAxisSize: MainAxisSize.min,
      children: [
        AppIcon(
          AppIcons.infoOutlineRounded,
          size: 14,
          color: colors.textSecondary,
        ),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            t.t('legal.attorneyAdvertising'),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}
