import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// R-387 (owner 04.11): a tap on a comment author's photo or name opens
/// their profile (attorney or client); a photo shows instead of initials.
Comment _comment(CommentAuthor author, {String id = 'c1'}) => Comment(
      id: id,
      postId: 'p1',
      author: author,
      body: 'Nice post',
      likeCount: 0,
      replyCount: 0,
      likedByMe: false,
      canDelete: false,
      isMine: false,
      createdAt: DateTime.now().subtract(const Duration(hours: 1)),
    );

const _attorney = CommentAuthor(
  isAttorney: true,
  attorneyId: 'a1',
  username: 'nora',
  displayName: 'Nora Mills',
  verified: false,
);

const _client = CommentAuthor(
  isAttorney: false,
  username: 'samk',
  displayName: 'Sam K.',
  avatarUrl: 'https://cdn.example/sam-256.jpg',
  verified: false,
);

Future<GoRouter> _pump(
  WidgetTester tester,
  Comment comment, {
  bool threads = false,
}) async {
  final router = GoRouter(
    initialLocation: '/start',
    routes: [
      GoRoute(
        path: '/start',
        builder: (_, __) => Scaffold(
          body: CommentTile(
            comment: comment,
            threads: threads,
            onReply: (_) {},
          ),
        ),
      ),
      GoRoute(
        path: '/lawyer/:u',
        builder: (_, s) => Text('LAWYER ${s.pathParameters['u']}'),
      ),
      GoRoute(
        path: '/client/:u',
        builder: (_, s) => Text('CLIENT ${s.pathParameters['u']}'),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: uxOverrides(social: FakeSocialRepository()),
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pump();
  return router;
}

void main() {
  setUpAll(initializeDateFormatting);

  for (final threads in [false, true]) {
    final mode = threads ? 'threads' : 'classic';

    testWidgets('$mode: tap on an attorney avatar opens /lawyer', (t) async {
      await _pump(t, _comment(_attorney), threads: threads);
      await t.tap(find.byType(GoldRingAvatar));
      await t.pumpAndSettle();
      expect(find.text('LAWYER nora'), findsOneWidget);
    });

    testWidgets('$mode: tap on a client name opens /client', (t) async {
      await _pump(t, _comment(_client), threads: threads);
      await t.tap(find.text('Sam K.'));
      await t.pumpAndSettle();
      expect(find.text('CLIENT samk'), findsOneWidget);
    });
  }

  testWidgets('a client under a case stays anonymous: no tap', (t) async {
    final router = await _pump(t, _comment(_client, id: 'case:c1'));
    await t.tap(find.byType(GoldRingAvatar));
    await t.pumpAndSettle();
    expect(router.state.matchedLocation, '/start');
  });

  testWidgets('the author photo is drawn when the url is present', (t) async {
    await _pump(t, _comment(_client));
    final avatar = t.widget<GoldRingAvatar>(find.byType(GoldRingAvatar));
    expect(avatar.url, 'https://cdn.example/sam-256.jpg');
    final app = t.widget<AppAvatar>(find.byType(AppAvatar));
    expect(app.imageProvider, isNotNull);
  });
}
