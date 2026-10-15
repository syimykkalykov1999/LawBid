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
    return Material(
      color: colors.surface,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenSide,
              vertical: AppSpacing.xs,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(
                      color: failed ? colors.danger : colors.text,
                    ),
                  ),
                ),
                if (failed)
                  TextButton(
                    onPressed: job.retry,
                    child: Text(t.t('error.retry')),
                  ),
                if (failed || s.phase == ReelPublishPhase.done)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: t.t('common.close'),
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: job.dismiss,
                  )
                else
                  TextButton(
                    onPressed: job.cancel,
                    child: Text(t.t('common.cancel')),
                  ),
              ],
            ),
          ),
          if (s.busy)
            LinearProgressIndicator(
              value: s.phase == ReelPublishPhase.posting ? null : s.progress,
              minHeight: 2,
              color: colors.gold,
              backgroundColor: colors.border,
            ),
        ],
      ),
    );
  }
}
