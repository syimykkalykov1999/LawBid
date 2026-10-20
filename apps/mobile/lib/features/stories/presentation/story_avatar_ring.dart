import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/presentation/story_navigation.dart';
import 'package:lawbid/features/stories/presentation/story_ring.dart';

/// Owner 2026-10-20 (Instagram / Telegram): a person's profile photo gets the
/// story ring when they have a live story I may see; a tap plays it. Without
/// one (or with the `stories` flag off) it is just [child]. The ring takes
/// [ringExtra] around the photo, so the layout of a profile header does not
/// jump when it appears: the caller gives the photo diameter as [size].
class StoryAvatarRing extends ConsumerWidget {
  const StoryAvatarRing({
    required this.userId,
    required this.size,
    required this.child,
    super.key,
  });

  final String userId;
  final double size;
  final Widget child;

  /// What the ring adds to the photo's diameter.
  static double ringExtra = StoryRingAvatar.outerFor(0);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(storiesEnabledProvider)) return child;
    final stories = ref.watch(userStoriesProvider(userId)).value;
    if (stories == null || stories.isEmpty) return child;
    final unseen = stories.any((s) => !s.viewedByMe);
    return GestureDetector(
      key: const ValueKey('profile-story-ring'),
      behavior: HitTestBehavior.opaque,
      onTap: () => openStories(context, userId),
      child: StoryRing(
        state: unseen ? StoryRingState.unseen : StoryRingState.seen,
        size: size,
        child: child,
      ),
    );
  }
}
