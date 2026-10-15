import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/reels/application/reel_publish_job.dart';

/// Owner 2026-10-15: a thin strip at the top of the app while a reel is
/// compressed, uploaded and posted in the background (Instagram-style); it
/// ends with «Опубликовано» (the video then finishes processing on the
/// server) or a retry when the upload failed.
class ReelPublishStrip extends ConsumerWidget {
  const ReelPublishStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(reelPublishJobProvider);
    if (s.phase == ReelPublishPhase.idle) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final job = ref.read(reelPublishJobProvider.notifier);
    final percent = '${(s.progress * 100).round()}';
    final label = switch (s.phase) {
      ReelPublishPhase.compressing =>
        t.t('reels.compressing', {'percent': percent}),
      ReelPublishPhase.uploading =>
        t.t('reels.uploading', {'percent': percent}),
      ReelPublishPhase.posting => t.t('reels.posting'),
      ReelPublishPhase.done => t.t('reels.processing.toast'),
      _ => t.t('reels.upload.failed'),
    };
    final failed = s.phase == ReelPublishPhase.failed;
    final done = s.phase == ReelPublishPhase.done;
    // Owner 2026-10-15: compact, like Instagram — 44 dp, a 32 dp preview,
    // 13 sp text and a thin progress line.
    return Material(
      color: colors.surface,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 44,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
              ),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: colors.goldTint,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: AppIcon(
                      failed
                          ? AppIcons.errorOutlineRounded
                          : done
                              ? AppIcons.checkRounded
                              : AppIcons.playArrowRounded,
                      size: 18,
                      color: failed ? colors.danger : colors.goldDark,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: failed ? colors.danger : colors.text,
                      ),
                    ),
                  ),
                  if (failed)
                    TextButton(
                      style: TextButton.styleFrom(
                        minimumSize: const Size(0, 32),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                      onPressed: job.retry,
                      child: Text(t.t('error.retry')),
                    ),
                  if (failed || done)
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      tooltip: t.t('common.close'),
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: job.dismiss,
                    )
                  else
                    TextButton(
                      style: TextButton.styleFrom(
                        minimumSize: const Size(0, 32),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                      onPressed: job.cancel,
                      child: Text(t.t('common.cancel')),
                    ),
                ],
              ),
            ),
          ),
          if (s.busy)
            LinearProgressIndicator(
              value: s.phase == ReelPublishPhase.posting ? null : s.progress,
              minHeight: 2,
              color: colors.gold,
              backgroundColor: colors.border,
            )
          else
            Divider(height: 1, color: colors.border),
        ],
      ),
    );
  }
}
