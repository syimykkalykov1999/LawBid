import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/social/application/comment_sender.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'social_fakes.dart';

/// SPEED_MATRIX 2026-11-09 §3 №14 (Instagram, Telegram): a comment is under
/// the post the moment «Send» is tapped — the server's answer replaces the
/// pending row, a refusal removes it and reports the error.
class _CommentingRepo extends FakeSocialRepository {
  Completer<Comment>? gate;
  ApiException? failWith;
  final sent = <(String postId, String body, String? parentId)>[];

  @override
  Future<Comment> addComment(
    String postId,
    String body, {
    String? parentId,
  }) async {
    sent.add((postId, body, parentId));
    if (gate != null) return gate!.future;
    final e = failWith;
    if (e != null) throw e;
    return _live('c-live', postId, body, parentId: parentId);
  }

  @override
  Future<CursorPage<Comment>> replies(
    String commentId, {
    String? cursor,
  }) async =>
      const CursorPage(items: []);
}

Comment _live(String id, String postId, String body, {String? parentId}) =>
    Comment(
      id: id,
      postId: postId,
      parentId: parentId,
      author: _me,
      body: body,
      likeCount: 0,
      replyCount: 0,
      likedByMe: false,
      canDelete: true,
      isMine: true,
      createdAt: DateTime(2026, 11, 9, 8),
    );

const _me = CommentAuthor(
  isAttorney: true,
  attorneyId: 'a-me',
  username: 'me',
  displayName: 'Me Myself',
  verified: true,
);

const _offline =
    ApiException(code: ApiException.networkErrorCode, message: 'offline');

ProviderContainer _container(_CommentingRepo repo) {
  final c = ProviderContainer(
    overrides: [
      socialRepositoryProvider.overrideWithValue(repo),
      myCommentAuthorProvider.overrideWithValue(_me),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('the comment is in the list before the server answers', () async {
    final repo = _CommentingRepo()..gate = Completer<Comment>();
    final c = _container(repo);
    // The list is open (loaded) when the person types.
    await c.read(commentsProvider('p1').future);
    final keep = c.listen(commentsProvider('p1'), (_, __) {});
    addTearDown(keep.close);

    final done = c
        .read(commentSenderProvider.notifier)
        .send(postId: 'p1', body: 'Great point');
    // Not awaited: the row is there at once.
    final pending = c.read(commentsProvider('p1')).value!.items;
    expect(pending, hasLength(1));
    expect(pending.single.body, 'Great point');
    expect(pending.single.author.displayName, 'Me Myself');
    expect(pending.single.isMine, isTrue);
    expect(isPendingComment(pending.single), isTrue);
    expect(repo.sent, [('p1', 'Great point', null)]);

    repo.gate!.complete(_live('c-live', 'p1', 'Great point'));
    final live = await done;
    expect(live.id, 'c-live');
    final after = c.read(commentsProvider('p1')).value!.items;
    expect(after.map((x) => x.id), ['c-live']);
    expect(after.single.canDelete, isTrue);
  });

  test('a refusal takes the row away and reports the error', () async {
    final repo = _CommentingRepo()..failWith = _offline;
    final c = _container(repo);
    await c.read(commentsProvider('p1').future);
    final keep = c.listen(commentsProvider('p1'), (_, __) {});
    addTearDown(keep.close);

    await expectLater(
      c.read(commentSenderProvider.notifier).send(postId: 'p1', body: 'Lost'),
      throwsA(same(_offline)),
    );
    expect(c.read(commentsProvider('p1')).value!.items, isEmpty);
  });

  test('a reply lands under its parent at once', () async {
    final repo = _CommentingRepo()..gate = Completer<Comment>();
    final c = _container(repo);
    await c.read(repliesProvider('c-parent').future);
    final keep = c.listen(repliesProvider('c-parent'), (_, __) {});
    addTearDown(keep.close);

    final done = c
        .read(commentSenderProvider.notifier)
        .send(postId: 'p1', body: 'Agreed', parentId: 'c-parent');
    final pending = c.read(repliesProvider('c-parent')).value!.items;
    expect(pending.single.parentId, 'c-parent');
    expect(repo.sent, [('p1', 'Agreed', 'c-parent')]);

    repo.gate!.complete(_live('r-live', 'p1', 'Agreed', parentId: 'c-parent'));
    await done;
    expect(
      c.read(repliesProvider('c-parent')).value!.items.map((x) => x.id),
      ['r-live'],
    );
  });
}
