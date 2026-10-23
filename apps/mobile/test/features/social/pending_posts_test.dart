import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/social/application/pending_posts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/pending_post_card.dart';

import 'social_fakes.dart';

/// Owner 2026-10-23 (Instagram): «Publish» closes the form at once; the post
/// is a «Publishing…» card with a thin line, then the live post; a failure
/// is a card with «Retry».
class _CreatingRepo extends FakeSocialRepository {
  final drafts = <PostDraft>[];
  Completer<Post>? gate;
  ApiException? failWith;

  @override
  Future<Post> createPost(PostDraft draft) async {
    drafts.add(draft);
    if (gate != null) return gate!.future;
    final e = failWith;
    if (e != null) throw e;
    return fakePost('new-1', mine: true);
  }
}

const _offline =
    ApiException(code: ApiException.networkErrorCode, message: 'offline');

PostDraft _draft() => const PostDraft(title: '', body: 'My first brief');

ProviderContainer _container(_CreatingRepo repo) {
  final c = ProviderContainer(
    overrides: [socialRepositoryProvider.overrideWithValue(repo)],
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('submit returns at once; the card goes when the live post arrives',
      () async {
    final repo = _CreatingRepo()..gate = Completer<Post>();
    final c = _container(repo);
    Post? live;
    c.read(pendingPostsProvider.notifier).submit(
          _draft(),
          onPublished: (p) => live = p,
        );
    // Returned without waiting for the server.
    expect(c.read(pendingPostsProvider), hasLength(1));
    expect(c.read(pendingPostsProvider).single.phase, PendingPostPhase.posting);
    repo.gate!.complete(fakePost('new-1', mine: true));
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    expect(c.read(pendingPostsProvider), isEmpty);
    expect(live?.id, 'new-1');
  });

  test('a failure keeps the card; retry sends the same Idempotency-Key',
      () async {
    final repo = _CreatingRepo()..failWith = _offline;
    final c = _container(repo);
    c.read(pendingPostsProvider.notifier).submit(_draft());
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    final failed = c.read(pendingPostsProvider).single;
    expect(failed.failed, isTrue);

    repo.failWith = null;
    c.read(pendingPostsProvider.notifier).retry(failed.id);
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    expect(c.read(pendingPostsProvider), isEmpty);
    expect(repo.drafts, hasLength(2));
    expect(repo.drafts[0].idempotencyKey, isNotNull);
    expect(repo.drafts[1].idempotencyKey, repo.drafts[0].idempotencyKey);
  });

  testWidgets('card: thin inline line while posting; Retry and × on failure',
      (tester) async {
    final repo = _CreatingRepo()..gate = Completer<Post>();
    final c = _container(repo);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: const Scaffold(body: PendingPostsStrip()),
        ),
      ),
    );
    expect(find.byKey(const ValueKey('pending-post-card')), findsNothing);

    c.read(pendingPostsProvider.notifier).submit(_draft());
    await tester.pump();
    expect(find.byKey(const ValueKey('pending-post-card')), findsOneWidget);
    expect(find.text('My first brief'), findsOneWidget);
    // The inline line, no blocking spinner anywhere.
    expect(find.byKey(const ValueKey('pending-post-progress')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byKey(const ValueKey('pending-post-retry')), findsNothing);

    repo.gate!.completeError(_offline);
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const ValueKey('pending-post-progress')), findsNothing);
    expect(find.byKey(const ValueKey('pending-post-retry')), findsOneWidget);

    // «Retry» posts again and the card swaps for the live post.
    repo
      ..gate = null
      ..failWith = null;
    await tester.tap(find.byKey(const ValueKey('pending-post-retry')));
    await tester.pump();
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const ValueKey('pending-post-card')), findsNothing);
    expect(repo.drafts, hasLength(2));
    // The feed keeps itself for 5 minutes; end the scope so no timer lingers.
    await tester.pumpWidget(const SizedBox());
    c.dispose();
  });

  testWidgets('× puts a failed card away', (tester) async {
    final repo = _CreatingRepo()..failWith = _offline;
    final c = _container(repo);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: const Scaffold(body: PendingPostsStrip()),
        ),
      ),
    );
    c.read(pendingPostsProvider.notifier).submit(_draft());
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('pending-post-dismiss')));
    await tester.pump();
    expect(find.byKey(const ValueKey('pending-post-card')), findsNothing);
  });
}
