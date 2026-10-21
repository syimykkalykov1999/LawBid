import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/reels/application/reel_publish_job.dart';

/// Owner 2026-10-21 (like Instagram): the reel being published is a card at
/// the top of the feed itself — never a bar over the app. A thin line of
/// progress runs along its bottom edge while the video is compressed,
/// uploaded and encoded; «Cancel» while it goes, «Retry» inside the card
/// when it failed (the video is kept); «Published» leaves by itself.
class ReelPublishCard extends ConsumerStatefulWidget {
  const ReelPublishCard({super.key});

  @override
  ConsumerState<ReelPublishCard> createState() => _ReelPublishCardState();
}

class _ReelPublishCardState extends ConsumerState<ReelPublishCard> {
  Timer? _hide;

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(reelPublishJobProvider);
    ref.listen(reelPublishJobProvider, (_, next) {
      _hide?.cancel();
      if (next.phase == ReelPublishPhase.done) {
        _hide = Timer(const Duration(seconds: 5), () {
          if (mounted) ref.read(reelPublishJobProvider.notifier).dismiss();
        });
      }
    });
    if (s.phase == ReelPublishPhase.idle) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final job = ref.read(reelPublishJobProvider.notifier);
    final percent = '${(s.progress * 100).round()}';
    final failed = s.phase == ReelPublishPhase.failed;
    final done = s.phase == ReelPublishPhase.done;
    final label = switch (s.phase) {
      ReelPublishPhase.compressing =>
        t.t('reels.compressing', {'percent': percent}),
      ReelPublishPhase.uploading =>
        t.t('reels.uploading', {'percent': percent}),
      ReelPublishPhase.posting => t.t('reels.posting'),
      ReelPublishPhase.processing => t.t('reels.processing'),
      ReelPublishPhase.done => t.t('post.brief.published'),
      _ => t.t('reels.upload.failed'),
    };
    final action = failed
        ? (t.t('error.retry'), job.retry)
        : done || s.phase == ReelPublishPhase.processing
            ? null
            : (t.t('common.cancel'), job.cancel);
    return Container(
      margin: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.sm,
      ),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: failed ? colors.danger : colors.border),
      ),
      child: InkWell(
        onTap: done ? () => context.go(AppRoutes.profile) : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: colors.border,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      done ? Icons.check_rounded : Icons.play_arrow_rounded,
                      color: colors.text,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: failed ? colors.danger : colors.text,
                      ),
                    ),
                  ),
                  if (action != null)
                    InkWell(
                      onTap: action.$2,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: AppSpacing.xs,
                        ),
                        child: Text(
                          action.$1,
                          style: type.bodySmall.copyWith(
                            color: colors.goldDark,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (s.busy)
              LinearProgressIndicator(
                value: s.phase == ReelPublishPhase.posting ||
                        s.phase == ReelPublishPhase.processing
                    ? null
                    : s.progress,
                minHeight: 2,
                color: colors.gold,
                backgroundColor: colors.border,
              ),
          ],
        ),
      ),
    );
  }
}
