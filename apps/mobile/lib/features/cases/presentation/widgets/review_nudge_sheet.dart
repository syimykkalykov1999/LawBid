import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';

/// Owner 2026-10-15: when a case is finished the client is asked — firmly,
/// kindly — to leave a review: it helps the next clients choose. Not forced:
/// a cross or «Later» closes the sheet, and it comes back once a day (when
/// the client opens that case) until the review is written.
const _kNudgeEvery = Duration(hours: 24);

String _key(String caseId) => 'review_nudge_$caseId';

/// Shows the sheet if the case still has no review and it was not dismissed
/// in the last day. Returns true when the client chose to write one.
Future<bool> maybeShowReviewNudge(
  BuildContext context,
  WidgetRef ref,
  String caseId,
) async {
  final prefs = ref.read(sharedPreferencesProvider);
  final last = prefs.getInt(_key(caseId));
  final now = DateTime.now();
  if (last != null &&
      now.difference(DateTime.fromMillisecondsSinceEpoch(last)) <
          _kNudgeEvery) {
    return false;
  }
  try {
    final own = await ref.read(ownCaseReviewProvider(caseId).future);
    if (own != null || !context.mounted) return false;
  } on Object {
    return false;
  }
  final write = await showAppBottomSheet<bool>(
    context: context,
    builder: (_) => const _ReviewNudge(),
  );
  if (write != true) {
    await prefs.setInt(_key(caseId), now.millisecondsSinceEpoch);
  }
  return write ?? false;
}

class _ReviewNudge extends ConsumerWidget {
  const _ReviewNudge();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final tint = Color.alphaBlend(colors.goldTint, practiceCardBase(colors));
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(child: AppSheetHandle()),
                IconButton(
                  key: const ValueKey('review-nudge-close'),
                  tooltip: t.t('common.close'),
                  onPressed: () => Navigator.of(context).pop(false),
                  icon: const AppIcon(AppIcons.closeRounded),
                ),
              ],
            ),
            Center(
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(color: tint, shape: BoxShape.circle),
                child: AppIcon(
                  AppIcons.starRounded,
                  size: 32,
                  color: readableOn(colors.gold, tint, min: 3),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('reviews.nudge.title'),
              textAlign: TextAlign.center,
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('reviews.nudge.body'),
              textAlign: TextAlign.center,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('review-nudge-write'),
              label: t.t('reviews.nudge.cta'),
              icon: AppIcons.starOutlineRounded,
              onPressed: () => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('review-nudge-later'),
              label: t.t('reviews.nudge.later'),
              variant: AppButtonVariant.secondary,
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}
