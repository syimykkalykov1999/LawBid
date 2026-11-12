import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner item 38 (Instagram/TikTok): the next page of comments is asked for
/// while the reader is still [kCommentsLoadAhead] comments from the end
/// (infinite_scroll_pagination «invisibleItemsThreshold»), not when the
/// spinner at the very end is built.
class _PagedComments extends FakeSocialRepository {
  final cursors = <String?>[];

  @override
  Future<CursorPage<Comment>> comments(String postId, {String? cursor}) async {
    cursors.add(cursor);
    if (cursor != null) return const CursorPage(items: []);
    return CursorPage(
      items: [for (var i = 0; i < 12; i++) _comment('c$i')],
      nextCursor: 'n1',
    );
  }
}

Comment _comment(String id) => Comment(
      id: id,
      postId: 'p1',
      author: const CommentAuthor(
        isAttorney: false,
        username: 'samk',
        displayName: 'Sam K.',
        verified: false,
      ),
      body: 'Nice post',
      likeCount: 0,
      replyCount: 0,
      likedByMe: false,
      canDelete: false,
      isMine: false,
      createdAt: DateTime.now().subtract(const Duration(hours: 1)),
    );

void main() {
  setUpAll(() => initializeDateFormatting('en'));

  testWidgets('the next page is asked for before the end is reached',
      (tester) async {
    tester.view
      ..physicalSize = const Size(400, 500)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repo = _PagedComments();
    final scroll = ScrollController();
    addTearDown(scroll.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(social: repo),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: Consumer(
              builder: (context, ref, _) => CustomScrollView(
                controller: scroll,
                scrollCacheExtent: const ScrollCacheExtent.pixels(0),
                slivers: commentThreadSlivers(
                  context,
                  ref,
                  'p1',
                  ref.watch(commentsProvider('p1')),
                  (_) {},
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // The first page (the phone copy read may ask for it twice).
    expect(repo.cursors, isNot(contains('n1')));
    // Scroll until the comment [kCommentsLoadAhead] from the end is built,
    // while the footer (the old trigger) is still off screen.
    const ahead = 'c${12 - kCommentsLoadAhead}';
    while (find.byKey(const ValueKey(ahead)).evaluate().isEmpty) {
      scroll.jumpTo(scroll.offset + 40);
      await tester.pump();
    }
    expect(find.byKey(const ValueKey('c11')), findsNothing);
    await tester.pump();
    expect(repo.cursors.where((c) => c == 'n1'), hasLength(1));
  });
}
