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
/// uploaded and encoded; «×» while it goes, «Retry» (and «×») inside the
/// card when it failed (the video is kept); «Published» leaves by itself.
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
    final cover = job.cover;
    // Owner 2026-10-22 (Instagram): one line for the whole publish — it
    // never runs to the end and starts again at «0%» between the phases.
    final overall = s.overall;
    final percent = '${(overall * 100).round()}';
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
    // Owner 2026-10-22 (Instagram): a small «×» (not a word) stops it while
    // it goes; a failed one keeps «Retry» and can be put away with «×».
    final close = failed
        ? job.dismiss
        : done || s.phase == ReelPublishPhase.processing
            ? null
            : job.cancel;
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
                  // Owner 2026-10-22 (Instagram): the reel's own cover from
                  // the first moment, not a grey box.
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      width: 40,
                      height: 52,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (cover != null && cover.isNotEmpty)
                            Image.memory(
                              cover,
                              fit: BoxFit.cover,
                              gaplessPlayback: true,
                              errorBuilder: (_, __, ___) =>
                                  ColoredBox(color: colors.border),
                            )
                          else
                            ColoredBox(color: colors.border),
                          if (done || cover == null || cover.isEmpty)
                            Center(
                              child: AppIcon(
                                done
                                    ? AppIcons.checkRounded
                                    : AppIcons.playArrowRounded,
                                color: cover == null || cover.isEmpty
                                    ? colors.text
                                    : ChatColors.onMediaScrim,
                              ),
                            ),
                        ],
                      ),
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
                  if (failed)
                    InkWell(
                      onTap: job.retry,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: AppSpacing.xs,
                        ),
                        child: Text(
                          t.t('error.retry'),
                          style: type.bodySmall.copyWith(
                            color: colors.goldDark,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  if (close != null)
                    IconButton(
                      onPressed: close,
                      tooltip: t.t('common.cancel'),
                      visualDensity: VisualDensity.compact,
                      icon: AppIcon(
                        AppIcons.closeRounded,
                        size: 20,
                        color: colors.textSecondary,
                      ),
                    ),
                ],
              ),
            ),
            if (s.busy &&
                (s.phase == ReelPublishPhase.posting ||
                    s.phase == ReelPublishPhase.processing))
              LinearProgressIndicator(
                minHeight: 2,
                color: colors.gold,
                backgroundColor: colors.border,
              )
            // Smooth: the line glides to each new value.
            else if (s.busy)
              TweenAnimationBuilder<double>(
                tween: Tween(end: overall),
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOut,
                builder: (_, v, __) => LinearProgressIndicator(
                  value: v,
                  minHeight: 2,
                  color: colors.gold,
                  backgroundColor: colors.border,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
