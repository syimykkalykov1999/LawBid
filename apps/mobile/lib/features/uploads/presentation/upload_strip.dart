import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/uploads/application/upload_queue.dart';

/// Owner 2026-10-08 (like Instagram): the posts and reels uploading in
/// the background, at the top of the feed — a thumbnail and a gold bar;
/// then «Опубликовано ✓» (tap opens the post) or «Повторить». Nothing
/// while the queue is empty.
class UploadStrip extends ConsumerWidget {
  const UploadStrip({this.onOpen, super.key});

  /// Opens the published post; default: its page.
  final void Function(BuildContext context, Post post)? onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(uploadQueueProvider);
    return AnimatedSize(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      alignment: Alignment.topCenter,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final t in tasks)
            UploadStripRow(key: ValueKey(t.id), task: t, onOpen: onOpen),
        ],
      ),
    );
  }
}

/// One upload: thumbnail, what is happening, the bar.
class UploadStripRow extends ConsumerWidget {
  const UploadStripRow({required this.task, this.onOpen, super.key});

  final UploadTask task;
  final void Function(BuildContext context, Post post)? onOpen;

  void _open(BuildContext context, WidgetRef ref) {
    final post = task.post;
    if (post == null) return;
    ref.read(uploadQueueProvider.notifier).dismiss(task.id);
    final open = onOpen;
    if (open != null) {
      open(context, post);
    } else {
      GoRouter.maybeOf(context)?.push(SocialRoutes.post(post.id));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final queue = ref.read(uploadQueueProvider.notifier);
    final done = task.status == UploadStatus.done;
    final failed = task.status == UploadStatus.failed;

    final label = switch (task.status) {
      UploadStatus.uploading => t.t(
          'reels.uploading',
          {'percent': '${(task.progress * 100).floor()}'},
        ),
      UploadStatus.done => t.t('upload.done'),
      UploadStatus.failed => t.t('upload.failed'),
    };

    final row = Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: Row(
        children: [
          _Thumb(task: task),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        label,
                        // An error has no bar: room for two lines.
                        maxLines: failed ? 2 : 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(
                          color: failed ? colors.dangerText : colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (done) ...[
                      const SizedBox(width: AppSpacing.xs),
                      AppIcon(
                        AppIcons.checkRounded,
                        size: 18,
                        color: colors.gold,
                      ),
                    ],
                  ],
                ),
                if (task.status == UploadStatus.uploading) ...[
                  const SizedBox(height: AppSpacing.xs),
                  _Bar(
                    value: task.progress,
                    color: colors.gold,
                    track: colors.border,
                  ),
                ],
              ],
            ),
          ),
          if (failed) ...[
            const SizedBox(width: AppSpacing.sm),
            AppPressable(
              onTap: () => queue.retry(task.id),
              child: Container(
                height: 32,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.goldTint,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  border: Border.all(color: colors.goldStroke),
                ),
                child: Text(
                  t.t('error.retry'),
                  style: type.bodySmall.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            AppIconButton(
              icon: AppIcon(
                AppIcons.closeRounded,
                size: 20,
                color: colors.textSecondary,
              ),
              semanticLabel: t.t('common.close'),
              onPressed: () => queue.dismiss(task.id),
            ),
          ],
        ],
      ),
    );

    if (!done) {
      return Semantics(
        liveRegion: true,
        label: label,
        child: row,
      );
    }
    return Semantics(
      button: true,
      label: t.t('upload.open'),
      excludeSemantics: true,
      child: AppPressable(onTap: () => _open(context, ref), child: row),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.task});

  final UploadTask task;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final bytes = task.thumbnail;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.field),
      child: SizedBox(
        width: 40,
        height: 40,
        child: bytes != null
            ? Image.memory(bytes, fit: BoxFit.cover, cacheWidth: 120)
            : ColoredBox(
                color: colors.goldTint,
                child: Center(
                  child: AppIcon(
                    task.video
                        ? AppIcons.filmReelOutlined
                        : AppIcons.imageOutlined,
                    size: 20,
                    color: colors.goldDark,
                  ),
                ),
              ),
      ),
    );
  }
}

/// The bar glides to each new value instead of jumping.
class _Bar extends StatelessWidget {
  const _Bar({required this.value, required this.color, required this.track});

  final double value;
  final Color color;
  final Color track;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: value),
      duration: context.reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 400),
      curve: Curves.easeOut,
      builder: (context, v, _) => ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.pill),
        child: LinearProgressIndicator(
          value: v,
          minHeight: 4,
          color: color,
          backgroundColor: track,
        ),
      ),
    );
  }
}
