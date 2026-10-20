import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/application/story_publish_job.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_navigation.dart';
import 'package:lawbid/features/stories/presentation/story_publish_sheet.dart';
import 'package:lawbid/features/stories/presentation/story_ring.dart';

/// Owner 2026-10-20: the row of story circles above the feed — my own
/// first (a "+" to add; a ring when I have live stories), then the people I
/// follow with live stories: a gold ring while something is unseen, a thin
/// grey one when all is seen. Nothing at all while the `stories` flag is
/// off, or while the row has nothing to show (loading / failed).
class StoriesTray extends ConsumerWidget {
  const StoriesTray({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    // A finished publish ends here (the creator screen only closes itself),
    // so the "posted" note shows once, whichever screen the viewer is on.
    ref.listen(storyPublishJobProvider, (prev, next) {
      if (next.phase == StoryPublishPhase.done &&
          prev?.phase != StoryPublishPhase.done) {
        ref.read(storyPublishJobProvider.notifier).dismiss();
        showAppSnackBar(context, t.t('story.publish.done'));
      }
    });
    if (!ref.watch(storiesEnabledProvider)) return const SizedBox.shrink();
    final items = ref.watch(storyTrayProvider).value;
    if (items == null || items.isEmpty) return const SizedBox.shrink();
    final job = ref.watch(storyPublishJobProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final label =
        MediaQuery.textScalerOf(context).scale(type.caption.fontSize ?? 12);
    final height =
        StoryRingAvatar.outerFor(_avatar) + AppSpacing.xs + label * 1.4;
    return SizedBox(
      height: height + AppSpacing.sm,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.xs,
        ),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.md),
        itemBuilder: (context, i) => _Bubble(
          key: ValueKey('story-bubble-${items[i].user.id}'),
          item: items[i],
          job: items[i].isMe ? job : const StoryPublishState(),
          t: t,
        ),
      ),
    );
  }
}

const double _avatar = 60;
const double _bubbleWidth = 72;

class _Bubble extends ConsumerWidget {
  const _Bubble({
    required this.item,
    required this.job,
    required this.t,
    super.key,
  });

  final StoryTrayItem item;
  final StoryPublishState job;
  final Translator t;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final failed = job.phase == StoryPublishPhase.failed;
    final state = failed
        ? StoryRingState.failed
        : item.isMe
            ? (item.hasStories ? StoryRingState.unseen : StoryRingState.none)
            : (item.hasUnseen ? StoryRingState.unseen : StoryRingState.seen);
    final name =
        item.isMe ? t.t('story.tray.yourStory') : item.user.displayName;
    final semantic = item.isMe
        ? name
        : t.t(
            item.hasUnseen ? 'story.tray.unseen' : 'story.tray.seen',
            {'name': name},
          );
    return SizedBox(
      width: _bubbleWidth,
      child: Semantics(
        button: true,
        label: semantic,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => _open(context, ref),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  StoryRingAvatar(
                    user: item.user,
                    size: _avatar,
                    state: state,
                    progress: job.busy ? _progressOf(job) : null,
                  ),
                  if (item.isMe && !job.busy)
                    PositionedDirectional(
                      end: 0,
                      bottom: 0,
                      child: _PlusBadge(
                        colors: colors,
                        label: t.t('story.tray.add'),
                        onTap: () => openStoryCreator(context),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: type.caption.copyWith(
                  color: item.hasUnseen || item.isMe
                      ? colors.text
                      : colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  double _progressOf(StoryPublishState s) => switch (s.phase) {
        StoryPublishPhase.compressing => s.progress * 0.3,
        StoryPublishPhase.uploading => 0.3 + s.progress * 0.6,
        StoryPublishPhase.processing => 0.92,
        _ => 0.97,
      };

  void _open(BuildContext context, WidgetRef ref) {
    if (!item.isMe) {
      openStories(context, item.user.id);
      return;
    }
    if (job.phase != StoryPublishPhase.idle) {
      showStoryPublishSheet(context);
    } else if (item.hasStories) {
      openStories(context, item.user.id);
    } else {
      openStoryCreator(context);
    }
  }
}

class _PlusBadge extends StatelessWidget {
  const _PlusBadge({
    required this.colors,
    required this.label,
    required this.onTap,
  });

  final AppColorTokens colors;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppTapTarget(
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: colors.gold,
                shape: BoxShape.circle,
                border: Border.all(color: colors.bg, width: 2),
              ),
              child:
                  Icon(AppIcons.addRounded, size: 14, color: colors.onAccent),
            ),
          ),
        ),
      );
}
