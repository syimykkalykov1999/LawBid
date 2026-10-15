import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/reels/application/reel_publish_job.dart';

/// Owner 2026-10-15 (like X / Threads): one thin line over the app while a
/// reel is compressed, uploaded and posted in the background — the text,
/// a hairline of progress and a «Cancel»; then «Published» (a tap opens
/// the profile; it leaves by itself) or «Failed · Retry» (the video is
/// kept).
class ReelPublishStrip extends ConsumerStatefulWidget {
  const ReelPublishStrip({super.key});

  @override
  ConsumerState<ReelPublishStrip> createState() => _ReelPublishStripState();
}

class _ReelPublishStripState extends ConsumerState<ReelPublishStrip> {
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
      ReelPublishPhase.done => t.t('post.brief.published'),
      _ => t.t('reels.upload.failed'),
    };
    final action = failed
        ? (t.t('error.retry'), job.retry)
        : done
            ? null
            : (t.t('common.cancel'), job.cancel);
    return Material(
      color: colors.surface,
      child: InkWell(
        onTap: done ? () => context.go(AppRoutes.profile) : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: 32,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                ),
                child: Row(
                  children: [
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
                    if (action != null)
                      InkWell(
                        onTap: action.$2,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.sm,
                            vertical: AppSpacing.xs,
                          ),
                          child: Text(
                            failed ? ' · ${action.$1}' : action.$1,
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
      ),
    );
  }
}
