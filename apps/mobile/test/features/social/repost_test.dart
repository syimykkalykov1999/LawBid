import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

import 'social_fakes.dart';

/// Owner 2026-10-07: Threads-style reposts — optimistic like a like.
void main() {
  test('repost shows at once, undo goes back', () async {
    final repo = FakeSocialRepository();
    final c = ProviderContainer(overrides: socialOverrides(repo));
    addTearDown(c.dispose);
    final actions = c.read(socialActionsProvider);
    final post = fakePost('p1').copyWith(repostCount: 2);

    expect(await actions.toggleRepost(post), isNull);
    expect(c.read(postOverridesProvider)['p1']?.repostedByMe, isTrue);
    expect(c.read(postOverridesProvider)['p1']?.repostCount, 3);

    expect(await actions.toggleRepost(post), isNull);
    expect(c.read(postOverridesProvider)['p1']?.repostedByMe, isFalse);
    expect(c.read(postOverridesProvider)['p1']?.repostCount, 2);
    expect(repo.repostCalls, [('p1', true), ('p1', false)]);
  });

  test('a failed repost rolls back', () async {
    final repo = FakeSocialRepository()..failReposts = true;
    final c = ProviderContainer(overrides: socialOverrides(repo));
    addTearDown(c.dispose);
    final future = c.read(socialActionsProvider).toggleRepost(fakePost('p1'));
    expect(c.read(postOverridesProvider)['p1']?.repostedByMe, isTrue);
    expect(c.read(postOverridesProvider)['p1']?.repostCount, 1);
    expect(await future, isNotNull);
    expect(c.read(postOverridesProvider)['p1']?.repostedByMe, isFalse);
    expect(c.read(postOverridesProvider)['p1']?.repostCount, 0);
  });

  test('a second tap while the first is in flight never calls twice', () async {
    final repo = FakeSocialRepository();
    final c = ProviderContainer(overrides: socialOverrides(repo));
    addTearDown(c.dispose);
    final actions = c.read(socialActionsProvider);
    final post = fakePost('p1');
    await Future.wait([actions.toggleRepost(post), actions.toggleRepost(post)]);
    expect(repo.repostCalls, [('p1', true)]);
  });

  test("one's own post is refused without calling the API", () async {
    final repo = FakeSocialRepository();
    final c = ProviderContainer(overrides: socialOverrides(repo));
    addTearDown(c.dispose);
    final own = Post(
      id: 'mine',
      author: fakePost('x').author,
      body: 'Mine',
      media: const [],
      tags: const [],
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false,
      isMine: true,
      createdAt: DateTime(2026, 10, 7),
    );
    final error = await c.read(socialActionsProvider).toggleRepost(own);
    expect(error, isA<ApiException>());
    expect((error! as ApiException).code, ApiErrorCodes.repostOwnPost);
    expect(repo.repostCalls, isEmpty);
    expect(c.read(postOverridesProvider)['mine'], isNull);
  });
}
