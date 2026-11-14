import 'dart:async';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/social/application/pending_posts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/pending_post_card.dart';

import '../../helpers/upload_queue_overrides.dart';
import 'social_fakes.dart';

/// Owner 2026-10-23 (Instagram) and 2026-11-08 (the app's own queue):
/// «Publish» closes the form at once, also while photos still go up; the
/// post is a «Publishing…» card, then the live post; a failure is a card
/// with «Retry»; a post cut off by closing the app goes on at the next start,
/// and never twice (the job id is the Idempotency-Key).
class _CreatingRepo extends FakeSocialRepository {
  final drafts = <PostDraft>[];
  final photos = <int>[];
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

  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
    String? path,
  }) async {
    photos.add(bytes.length);
    return 'photo-${photos.length}';
  }
}

const _offline =
    ApiException(code: ApiException.networkErrorCode, message: 'offline');

PostDraft _draft() => const PostDraft(title: '', body: 'My first brief');

ProviderContainer _container(_CreatingRepo repo, {UploadQueueDatabase? db}) {
  final c = ProviderContainer(
    overrides: [
      socialRepositoryProvider.overrideWithValue(repo),
      ...uploadQueueOverrides(db: db, fixedOnline: true),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 120));

/// Waits (up to 5 s) until [done] — the queue runs on real Drift timers.
Future<void> _until(bool Function() done) async {
  for (var i = 0; i < 100 && !done(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
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
    await _settle();
    repo.gate!.complete(fakePost('new-1', mine: true));
    await _settle();
    expect(c.read(pendingPostsProvider), isEmpty);
    expect(live?.id, 'new-1');
  });

  test(
      '«Publish» while a photo still uploads: the post waits for it, the '
      'photo is not sent twice', () async {
    final repo = _CreatingRepo();
    final c = _container(repo);
    final upload = Completer<String>();
    c.read(pendingPostsProvider.notifier).submit(
      _draft(),
      photos: [
        (fileId: 'ready-1', bytes: null, upload: null),
        (fileId: null, bytes: Uint8List(5), upload: upload.future),
      ],
    );
    await _settle();
    expect(repo.drafts, isEmpty, reason: 'waits for the photo');
    upload.complete('form-2');
    await _settle();
    expect(repo.drafts.single.mediaFileIds, ['ready-1', 'form-2']);
    expect(repo.photos, isEmpty, reason: 'the form already sent it');
  });

  test('a photo whose form upload failed is sent from the kept bytes',
      () async {
    final repo = _CreatingRepo();
    final c = _container(repo);
    final upload = Completer<String>()..completeError(_offline);
    upload.future.ignore();
    c.read(pendingPostsProvider.notifier).submit(
      _draft(),
      photos: [(fileId: null, bytes: Uint8List(7), upload: upload.future)],
    );
    await _until(() => repo.drafts.isNotEmpty);
    expect(repo.photos, [7]);
    expect(repo.drafts.single.mediaFileIds, ['photo-1']);
  });

  test('closing the app mid-way: the post goes on at the next start, once',
      () async {
    final db = UploadQueueDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final first = _CreatingRepo()..failWith = _offline;
    final c1 = _container(first, db: db);
    c1.read(pendingPostsProvider.notifier).submit(
      _draft(),
      photos: [(fileId: null, bytes: Uint8List(3), upload: null)],
    );
    await _until(() => first.drafts.isNotEmpty);
    expect(first.drafts, hasLength(1));
    final key = first.drafts.single.idempotencyKey;
    c1.dispose(); // the app is closed

    final second = _CreatingRepo();
    final c2 = _container(second, db: db)
      ..read(pendingPostsProvider); // the next start
    await _until(
      () => second.drafts.isNotEmpty && c2.read(pendingPostsProvider).isEmpty,
    );
    // The photo id saved by the first run is reused, the key is the same.
    expect(second.photos, isEmpty);
    expect(second.drafts.single.idempotencyKey, key);
    expect(second.drafts.single.mediaFileIds, ['photo-1']);
    expect(c2.read(pendingPostsProvider), isEmpty);
  });

  test('a failure keeps the card; retry sends the same Idempotency-Key',
      () async {
    final repo = _CreatingRepo()..failWith = _offline;
    final c = _container(repo);
    c.read(pendingPostsProvider.notifier).submit(_draft());
    await _settle();
    final failed = c.read(pendingPostsProvider).single;
    expect(failed.failed, isTrue);

    repo.failWith = null;
    c.read(pendingPostsProvider.notifier).retry(failed.id);
    await _settle();
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

    await tester.runAsync(_settle);
    repo.gate!.completeError(_offline);
    await tester.runAsync(_settle);
    await tester.pump();
    expect(find.byKey(const ValueKey('pending-post-progress')), findsNothing);
    expect(find.byKey(const ValueKey('pending-post-retry')), findsOneWidget);

    // «Retry» posts again and the card swaps for the live post.
    repo
      ..gate = null
      ..failWith = null;
    await tester.tap(find.byKey(const ValueKey('pending-post-retry')));
    await tester.runAsync(_settle);
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
    await tester.runAsync(_settle);
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('pending-post-dismiss')));
    await tester.pump();
    expect(find.byKey(const ValueKey('pending-post-card')), findsNothing);
    await tester.runAsync(_settle);
    // The queue's retry timer and the feed go with the scope.
    await tester.pumpWidget(const SizedBox());
    c.dispose();
  });
}
