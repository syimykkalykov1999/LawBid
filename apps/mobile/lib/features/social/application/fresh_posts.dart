import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-19 (Instagram): new posts wait above the feed instead of
/// pushing it around — after the app comes back from a while in the
/// background (or the feed opens again later) the first page is read
/// quietly, and the posts not in the feed yet show as the «New posts»
/// pill; a tap on it scrolls up and loads them. Scrolling down never
/// changes; a pull-to-refresh takes them in as before.
class FreshPosts extends Notifier<List<Post>> {
  /// A quiet check runs at most this often.
  static const minGap = Duration(minutes: 5);

  DateTime? _checkedAt;
  bool _checking = false;

  @override
  List<Post> build() {
    ref.watch(currentUserIdProvider);
    return const [];
  }

  /// Reads the feed's first page and keeps what the feed does not show.
  /// [force]: ignore [minGap].
  Future<void> check({bool force = false}) async {
    final now = DateTime.now();
    final last = _checkedAt;
    if (_checking ||
        (!force && last != null && now.difference(last) < minGap)) {
      return;
    }
    final shown = ref.read(feedProvider).value?.items;
    if (shown == null || shown.isEmpty) return;
    _checking = true;
    _checkedAt = now;
    try {
      final page = await ref.read(socialRepositoryProvider).feed();
      if (!ref.mounted) return;
      final ids = {
        for (final p in ref.read(feedProvider).value?.items ?? shown) p.id,
      };
      final newest =
          shown.map((p) => p.createdAt).reduce((a, b) => a.isAfter(b) ? a : b);
      state = [
        for (final p in page.items)
          if (!ids.contains(p.id) && !p.isMine && p.createdAt.isAfter(newest))
            p,
      ];
    } on Object {
      // Quiet: no pill when the check fails.
    } finally {
      _checking = false;
    }
  }

  /// The feed took them in (the pill's tap, a pull-to-refresh).
  void clear() {
    if (state.isNotEmpty) state = const [];
  }
}

final freshPostsProvider =
    NotifierProvider<FreshPosts, List<Post>>(FreshPosts.new);
