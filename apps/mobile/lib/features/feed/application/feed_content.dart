import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Owner 2026-10-05: which posts the feed, topic lists and search show —
/// every post, or only legal ones (general posts such as food or travel
/// hidden). Kept on the server (it filters there); the last value is also
/// kept on the device so the slider shows it before the network answers.
enum FeedContentMode { all, legalOnly }

const _prefsKey = 'feed.contentMode.v1';

class FeedContentModeNotifier extends Notifier<FeedContentMode> {
  @override
  FeedContentMode build() {
    try {
      final saved = ref.read(sharedPreferencesProvider).getString(_prefsKey);
      if (saved == FeedContentMode.legalOnly.name) {
        return FeedContentMode.legalOnly;
      }
    } on Object {
      // Tests / previews without preferences: the default.
    }
    return FeedContentMode.all;
  }

  /// The server's value (the admin default until the person picks one).
  Future<void> sync() async {
    try {
      final legalOnly =
          await ref.read(socialRepositoryProvider).legalOnlyFeed();
      final mode = legalOnly ? FeedContentMode.legalOnly : FeedContentMode.all;
      if (_apply(mode)) _reloadLists();
    } on Object {
      // Offline: keep the value on the device.
    }
  }

  Future<void> set(FeedContentMode mode) async {
    final before = state;
    if (!_apply(mode)) return;
    try {
      await ref
          .read(socialRepositoryProvider)
          .setLegalOnlyFeed(legalOnly: mode == FeedContentMode.legalOnly);
      // The server filters: reload the lists with the new rule.
      _reloadLists();
    } on Object {
      _apply(before);
      rethrow;
    }
  }

  /// True when the mode changed.
  bool _apply(FeedContentMode mode) {
    if (mode == state) return false;
    state = mode;
    try {
      ref.read(sharedPreferencesProvider).setString(_prefsKey, mode.name);
    } on Object {
      // Not persisted without preferences.
    }
    return true;
  }

  void _reloadLists() {
    ref
      ..invalidate(feedProvider)
      ..invalidate(latestPostsProvider)
      ..invalidate(filteredPostsProvider)
      ..invalidate(explorePostsProvider)
      ..invalidate(tagPostsProvider);
  }
}

final feedContentModeProvider =
    NotifierProvider<FeedContentModeNotifier, FeedContentMode>(
  FeedContentModeNotifier.new,
);

/// Owner 2026-10-06: what «Юр. посты» shows — every legal post (a post
/// with a qualification), or only those of the qualifications picked in
/// «Выберите темы». Picked inside «Выберите темы»; kept on the device, like
/// the topics themselves.
enum FeedLegalScope { all, mine }

const _scopeKey = 'feed.legalScope.v1';

class FeedLegalScopeNotifier extends Notifier<FeedLegalScope> {
  @override
  FeedLegalScope build() {
    try {
      final saved = ref.read(sharedPreferencesProvider).getString(_scopeKey);
      if (saved == FeedLegalScope.mine.name) return FeedLegalScope.mine;
    } on Object {
      // Tests / previews without preferences: the default.
    }
    return FeedLegalScope.all;
  }

  void set(FeedLegalScope scope) {
    state = scope;
    try {
      ref.read(sharedPreferencesProvider).setString(_scopeKey, scope.name);
    } on Object {
      // Not persisted without preferences; the in-memory choice still works.
    }
  }
}

final feedLegalScopeProvider =
    NotifierProvider<FeedLegalScopeNotifier, FeedLegalScope>(
  FeedLegalScopeNotifier.new,
);
