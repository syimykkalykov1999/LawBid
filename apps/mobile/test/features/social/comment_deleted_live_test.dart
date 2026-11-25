import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'social_fakes.dart';

class _Repo extends FakeSocialRepository {
  @override
  Future<CursorPage<Comment>> comments(String postId, {String? cursor}) async =>
      CursorPage(
        items: [
          _comment('c1', replies: 0),
          _comment('c2', replies: 2),
        ],
      );
}

Comment _comment(String id, {required int replies}) => Comment(
      id: id,
      postId: 'p1',
      author: const CommentAuthor(
        isAttorney: false,
        username: 'sam',
        displayName: 'Sam Kent',
        verified: false,
      ),
      body: 'text $id',
      likeCount: 0,
      replyCount: replies,
      likedByMe: false,
      canDelete: false,
      isMine: false,
      createdAt: DateTime(2026, 11, 25, 9),
    );

/// Pack B (ROUND2 25.11 #6): a comment deleted by someone else while the
/// post's comments are open leaves the list at once (`comment:deleted` in
/// the post's room, as `comment:new` adds one); a deleted reply lowers its
/// parent's count. Before, the row stayed until the post was reopened.
void main() {
  test('a comment deleted elsewhere leaves the open list', () async {
    final events = StreamController<RealtimeEvent>.broadcast(sync: true);
    addTearDown(events.close);
    final c = ProviderContainer(
      overrides: [
        socialRepositoryProvider.overrideWithValue(_Repo()),
        realtimeClientProvider.overrideWithValue(null),
        realtimeEventsProvider.overrideWithValue(events.stream),
      ],
    );
    addTearDown(c.dispose);
    final keep = c.listen(commentsProvider('p1'), (_, __) {});
    addTearDown(keep.close);
    await c.read(commentsProvider('p1').future);
    await Future<void>.delayed(Duration.zero);

    events.add(
      const RealtimeEvent('comment:deleted', {
        'postId': 'p1',
        'commentId': 'c1',
        'parentCommentId': null,
        'removed': 1,
      }),
    );
    expect(
      c.read(commentsProvider('p1')).value!.items.map((x) => x.id),
      ['c2'],
    );

    // A reply of c2: its count drops; another post's event changes nothing.
    events
      ..add(
        const RealtimeEvent('comment:deleted', {
          'postId': 'p1',
          'commentId': 'r9',
          'parentCommentId': 'c2',
          'removed': 1,
        }),
      )
      ..add(
        const RealtimeEvent('comment:deleted', {
          'postId': 'p2',
          'commentId': 'c2',
          'parentCommentId': null,
          'removed': 1,
        }),
      );
    final items = c.read(commentsProvider('p1')).value!.items;
    expect(items.map((x) => x.id), ['c2']);
    expect(items.single.replyCount, 1);
  });
}
