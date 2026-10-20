import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/settings/archive/archive_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-18 (Instagram): the ⋯ menu of an own post turns comments
/// off / on and archives / restores it; Settings → «Архив» lists the
/// archived posts and opens one with a note that only the author sees it.
void main() {
  setUpAll(initializeDateFormatting);

  Post own(
    String id, {
    bool commentsEnabled = true,
    DateTime? archivedAt,
    bool mine = true,
  }) =>
      Post(
        id: id,
        author: const PostAuthor(
          id: 'a1',
          username: 'sofia.hernandez',
          firstName: 'Sofia',
          lastName: 'Hernandez',
          verified: true,
        ),
        title: 'Title $id',
        body: 'Text of $id',
        media: const [],
        tags: const [],
        likeCount: 3,
        commentCount: 2,
        likedByMe: false,
        savedByMe: false,
        isMine: mine,
        createdAt: DateTime(2026, 10, 14),
        commentsEnabled: commentsEnabled,
        archivedAt: archivedAt,
      );

  Future<ProviderContainer> pumpMenu(
    WidgetTester t,
    _ArchiveRepo repo,
    Post post,
  ) async {
    t.view.physicalSize = const Size(400, 1000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    late ProviderContainer container;
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: Consumer(
            builder: (context, ref, _) {
              container = ProviderScope.containerOf(context);
              return TextButton(
                onPressed: () => showPostMenu(context, ref, post),
                child: const Text('open'),
              );
            },
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(400, 1000),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    return container;
  }

  testWidgets('own post: Archive hides it everywhere, says so', (t) async {
    final repo = _ArchiveRepo();
    final c = await pumpMenu(t, repo, own('p1'));
    expect(find.text('Turn off commenting'), findsOneWidget);
    expect(find.byKey(const ValueKey('post-menu-pin')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('post-menu-archive')));
    await t.pumpAndSettle();
    expect(repo.archiveCalls, [('p1', true)]);
    expect(find.text('Post archived'), findsOneWidget);
    expect(c.read(deletedPostsProvider), contains('p1'));
    expect(c.read(postOverridesProvider)['p1']?.isArchived, isTrue);
  });

  testWidgets('own post: Turn off commenting calls the server', (t) async {
    final repo = _ArchiveRepo();
    final c = await pumpMenu(t, repo, own('p1'));
    await t.tap(find.byKey(const ValueKey('post-menu-comments')));
    await t.pumpAndSettle();
    expect(repo.commentsCalls, [('p1', false)]);
    expect(find.text('Commenting turned off'), findsOneWidget);
    expect(c.read(postOverridesProvider)['p1']?.commentsEnabled, isFalse);
  });

  testWidgets(
      'archived post with comments off: Show on profile and Turn on '
      'commenting, no pin or promote', (t) async {
    final repo = _ArchiveRepo();
    final c = await pumpMenu(
      t,
      repo,
      own('p1', commentsEnabled: false, archivedAt: DateTime(2026, 10, 18)),
    );
    c.read(deletedPostsProvider.notifier).add('p1');
    expect(find.text('Turn on commenting'), findsOneWidget);
    expect(find.text('Show on profile'), findsOneWidget);
    expect(find.byKey(const ValueKey('post-menu-pin')), findsNothing);
    await t.tap(find.text('Show on profile'));
    await t.pumpAndSettle();
    expect(repo.archiveCalls, [('p1', false)]);
    expect(find.text('The post is back on your profile'), findsOneWidget);
    expect(c.read(deletedPostsProvider), isNot(contains('p1')));
  });

  testWidgets('someone else’s post: no archive or comments switch', (t) async {
    final repo = _ArchiveRepo();
    await pumpMenu(t, repo, own('p1', mine: false));
    expect(find.byKey(const ValueKey('post-menu-archive')), findsNothing);
    expect(find.byKey(const ValueKey('post-menu-comments')), findsNothing);
  });

  // Lets the list providers' keep-alive timers run out.
  Future<void> settle(WidgetTester t) async {
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  }

  Future<void> pumpArchive(WidgetTester t, _ArchiveRepo repo) async {
    t.view.physicalSize = const Size(400, 900);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        const ArchiveScreen(),
        theme: AppTheme.light(),
        size: const Size(400, 900),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.pump(const Duration(seconds: 1));
  }

  testWidgets('Archive screen: grid of archived posts, opens one', (t) async {
    final at = DateTime(2026, 10, 18);
    final repo = _ArchiveRepo()
      ..archived = [own('a2', archivedAt: at), own('a1', archivedAt: at)];
    await pumpArchive(t, repo);
    expect(find.text('Archive'), findsOneWidget);
    expect(find.byKey(const ValueKey('archive-tile-a2')), findsOneWidget);
    expect(find.byKey(const ValueKey('archive-tile-a1')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('archive-tile-a2')));
    await t.pumpAndSettle();
    expect(find.byType(ArchivedPostScreen), findsOneWidget);
    expect(find.byKey(const ValueKey('archive-post-note')), findsOneWidget);
    expect(
      find.text('Archived — only you can see this post'),
      findsOneWidget,
    );
    expect(t.takeException(), isNull);
    await settle(t);
  });

  testWidgets('Archive screen: empty state', (t) async {
    await pumpArchive(t, _ArchiveRepo());
    expect(find.byKey(const ValueKey('archive-empty')), findsOneWidget);
    expect(find.text('Nothing archived'), findsOneWidget);
    await settle(t);
  });
}

class _ArchiveRepo extends FakeSocialRepository {
  List<Post> archived = const [];
  final archiveCalls = <(String, bool)>[];
  final commentsCalls = <(String, bool)>[];

  Post _changed(String id, {bool? archived, bool? comments}) => Post(
        id: id,
        author: const PostAuthor(
          id: 'a1',
          username: 'sofia.hernandez',
          firstName: 'Sofia',
          lastName: 'Hernandez',
          verified: true,
        ),
        body: 'Text of $id',
        media: const [],
        tags: const [],
        likeCount: 3,
        commentCount: 2,
        likedByMe: false,
        savedByMe: false,
        isMine: true,
        createdAt: DateTime(2026, 10, 14),
        commentsEnabled: comments ?? true,
        archivedAt: (archived ?? false) ? DateTime(2026, 10, 18) : null,
      );

  @override
  Future<Post> setPostArchived(String id, {required bool archived}) async {
    archiveCalls.add((id, archived));
    return _changed(id, archived: archived);
  }

  @override
  Future<Post> setPostCommentsEnabled(
    String id, {
    required bool enabled,
  }) async {
    commentsCalls.add((id, enabled));
    return _changed(id, comments: enabled);
  }

  @override
  Future<CursorPage<Post>> archivedPosts({String? cursor}) async =>
      CursorPage(items: archived);
}
