import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Owner 2026-11-04 (R-406): how a topic page lists its posts — the feed's
/// cards (default) or the Search tab's 3-column grid of tiles.
enum TopicViewMode { list, grid }

const _prefsPrefix = 'topic.view.v1';

/// The viewer's choice, kept on the device per signed-in account (a
/// per-viewer convenience, like the feed's topic slider); default = list.
/// Same for our practice topics and for people's hashtag topics.
class TopicViewModeNotifier extends Notifier<TopicViewMode> {
  String get _key => '$_prefsPrefix.${ref.read(currentUserIdProvider) ?? ''}';

  @override
  TopicViewMode build() {
    // A sign-in / sign-out switches to that account's choice.
    ref.watch(currentUserIdProvider);
    try {
      final saved = ref.read(sharedPreferencesProvider).getString(_key);
      if (saved == TopicViewMode.grid.name) return TopicViewMode.grid;
    } on Object {
      // Tests / previews without preferences: the default.
    }
    return TopicViewMode.list;
  }

  void set(TopicViewMode mode) {
    state = mode;
    try {
      ref.read(sharedPreferencesProvider).setString(_key, mode.name);
    } on Object {
      // Not persisted without preferences; the in-memory choice still works.
    }
  }

  void toggle() => set(
        state == TopicViewMode.list ? TopicViewMode.grid : TopicViewMode.list,
      );
}

final topicViewModeProvider =
    NotifierProvider<TopicViewModeNotifier, TopicViewMode>(
  TopicViewModeNotifier.new,
);
