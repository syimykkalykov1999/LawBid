import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'social_fakes.dart';

/// Owner 2026-11-11 (speed, Instagram / Telegram): «Saved», likers and the
/// other social lists open at once on the page this phone showed last
/// time; the live page swaps in behind it, no extra request.
class _Repo extends FakeSocialRepository {
  final live = Completer<CursorPage<SavedPost>>();
  CursorPage<SavedPost>? copy;
  int liveReads = 0;

  @override
  Future<CursorPage<SavedPost>> savedPosts({String? cursor}) async {
    if (readingFromPhoneOnly) {
      final c = copy;
      if (c == null) throw StateError(kNoPhoneCopy);
      return c;
    }
    liveReads++;
    return live.future;
  }
}

SavedPost _saved(String id) =>
    SavedPost(postId: id, savedAt: DateTime(2026, 11, 11));

void main() {
  late _Repo repo;
  late ProviderContainer c;

  setUp(() {
    repo = _Repo();
    c = ProviderContainer(
      overrides: [socialRepositoryProvider.overrideWithValue(repo)],
    );
  });

  Future<PaginatedList<SavedPost>> open() {
    c.listen(savedPostsProvider, (_, __) {});
    return c.read(savedPostsProvider.future);
  }

  tearDown(() => c.dispose());

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('opens on the phone copy before the server answers', () async {
    repo.copy = CursorPage(items: [_saved('old')]);
    final first = await open();
    expect(first.items.map((e) => e.postId), ['old']);

    repo.live.complete(CursorPage(items: [_saved('new'), _saved('old')]));
    await settle();
    await settle();
    expect(
      c.read(savedPostsProvider).requireValue.items.map((e) => e.postId),
      ['new', 'old'],
    );
    expect(repo.liveReads, 1);
  });

  test('no copy on the phone: loads from the server as before', () async {
    repo.live.complete(CursorPage(items: [_saved('a')]));
    final first = await open();
    expect(first.items.map((e) => e.postId), ['a']);
    expect(repo.liveReads, 1);
  });
}
