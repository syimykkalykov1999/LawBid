import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;
import 'package:lawbid/features/stories/data/stories_repository.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

Duration? _noRetry(int retryCount, Object error) => null;

final storiesRepositoryProvider = Provider<StoriesRepository>(
  (ref) => StoriesRepository(
    apiDio: ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
  ),
);

/// The `stories` feature flag (admin → Feature flags).
final storiesEnabledProvider = Provider<bool>(
  (ref) => ref.watch(
    featureFlagsControllerProvider.select((s) => s.isEnabled('stories')),
  ),
);

/// The longest story video, seconds (`stories.max_video_sec`, 15 by default).
final storyMaxVideoSecProvider = Provider<int>(
  (ref) => ref
      .watch(
        featureFlagsControllerProvider.select(
          (s) => s.configInt('stories.max_video_sec', kStoryDefaultVideoSec),
        ),
      )
      .clamp(1, 60),
);

/// `GET /stories/tray` — me first, then people I follow with live stories.
/// Empty while the flag is off (the server would answer 403).
final storyTrayProvider = FutureProvider<List<StoryTrayItem>>(
  (ref) async {
    if (!ref.watch(storiesEnabledProvider)) return const [];
    ref.watch(currentUserIdProvider);
    return ref.watch(storiesRepositoryProvider).tray();
  },
  retry: _noRetry,
);

/// A person's live stories, oldest first (the order they play in).
final userStoriesProvider =
    FutureProvider.autoDispose.family<List<Story>, String>(
  (ref, userId) => ref.watch(storiesRepositoryProvider).ofUser(userId),
  retry: _noRetry,
);

/// My story settings (`GET/PATCH /stories/settings`).
final storySettingsProvider =
    AsyncNotifierProvider.autoDispose<StorySettingsController, StorySettings>(
  StorySettingsController.new,
  retry: _noRetry,
);

class StorySettingsController extends AsyncNotifier<StorySettings> {
  @override
  Future<StorySettings> build() =>
      ref.watch(storiesRepositoryProvider).settings();

  Future<void> setAudience(StoryAudience audience) async {
    final next = await ref
        .read(storiesRepositoryProvider)
        .updateSettings(audience: audience);
    if (ref.mounted) state = AsyncData(next);
  }

  Future<void> setAllowReplies({required bool value}) async {
    final next = await ref
        .read(storiesRepositoryProvider)
        .updateSettings(allowReplies: value);
    if (ref.mounted) state = AsyncData(next);
  }

  /// The hidden list changed: the count in the settings follows.
  Future<void> reload() async {
    final next = await ref.read(storiesRepositoryProvider).settings();
    if (ref.mounted) state = AsyncData(next);
  }
}

/// The people my stories are hidden from.
final hiddenStoriesProvider =
    AsyncNotifierProvider.autoDispose<HiddenStoriesController, List<StoryUser>>(
  HiddenStoriesController.new,
  retry: _noRetry,
);

class HiddenStoriesController extends AsyncNotifier<List<StoryUser>> {
  @override
  Future<List<StoryUser>> build() =>
      ref.watch(storiesRepositoryProvider).hidden();

  Future<void> unhide(StoryUser user) async {
    await ref.read(storiesRepositoryProvider).unhide(user.id);
    if (!ref.mounted) return;
    state = AsyncData([
      for (final u in state.value ?? const <StoryUser>[])
        if (u.id != user.id) u,
    ]);
    ref.read(storySettingsProvider.notifier).reload().ignore();
  }

  Future<void> hide(StoryUser user) async {
    await ref.read(storiesRepositoryProvider).hide(user.id);
    if (!ref.mounted) return;
    final now = state.value ?? const <StoryUser>[];
    state = AsyncData([user, ...now.where((u) => u.id != user.id)]);
    ref.read(storySettingsProvider.notifier).reload().ignore();
  }
}

/// My expired stories, newest first (paged).
final storyArchiveProvider = AsyncNotifierProvider.autoDispose<
    StoryArchiveController, PaginatedList<Story>>(
  StoryArchiveController.new,
  retry: _noRetry,
);

class StoryArchiveController extends PagedNotifier<Story> {
  @override
  Future<CursorPage<Story>> fetch(String? cursor) =>
      ref.read(storiesRepositoryProvider).archive(cursor: cursor);

  @override
  Object idOf(Story item) => item.id;
}

/// Who saw one of my stories (paged, newest view first).
final storyViewersProvider = AsyncNotifierProvider.autoDispose
    .family<StoryViewersController, PaginatedList<StoryViewer>, String>(
  StoryViewersController.new,
  retry: _noRetry,
);

class StoryViewersController extends PagedNotifier<StoryViewer> {
  StoryViewersController(this.storyId);

  final String storyId;

  @override
  Future<CursorPage<StoryViewer>> fetch(String? cursor) =>
      ref.read(storiesRepositoryProvider).viewers(storyId, cursor: cursor);

  @override
  Object idOf(StoryViewer item) => item.user.id;
}

/// People I follow, optionally filtered by `query` — the "hide from" picker.
final storyFollowingProvider = AsyncNotifierProvider.autoDispose
    .family<StoryFollowingController, PaginatedList<StoryUser>, String>(
  StoryFollowingController.new,
  retry: _noRetry,
);

class StoryFollowingController extends PagedNotifier<StoryUser> {
  StoryFollowingController(this.query);

  final String query;

  @override
  Future<CursorPage<StoryUser>> fetch(String? cursor) {
    final me = ref.read(currentUserIdProvider);
    if (me == null) return Future.value(const CursorPage(items: []));
    return ref
        .read(storiesRepositoryProvider)
        .following(me, cursor: cursor, q: query);
  }

  @override
  Object idOf(StoryUser item) => item.id;
}
