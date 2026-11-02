import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Owner 2026-10-28 (phone test, the app froze hard on a swipe from Posts
/// into Reels): the Reels page opens no video player while it slides in —
/// only once the pages are at rest on it — and closes it once they rest
/// on another page.
class _FakePlayer extends VideoPlayerController {
  _FakePlayer() : super.networkUrl(Uri.parse('https://cdn.test/r.m3u8'));

  bool disposed = false;

  @override
  Future<void> initialize() async {
    value = value.copyWith(
      isInitialized: true,
      duration: const Duration(seconds: 30),
      size: const Size(720, 1280),
    );
  }

  @override
  Future<void> play() async => value = value.copyWith(isPlaying: true);

  @override
  Future<void> pause() async => value = value.copyWith(isPlaying: false);

  @override
  Future<void> setLooping(bool looping) async {}

  @override
  Future<void> setVolume(double volume) async {}

  @override
  Future<void> seekTo(Duration position) async =>
      value = value.copyWith(position: position);

  @override
  Future<Duration?> get position async => value.position;

  @override
  Future<void> dispose() async {
    disposed = true;
    await super.dispose();
  }
}

Post _reel(String id) {
  final base = fakePost(id);
  return Post(
    id: base.id,
    author: base.author,
    body: 'reel $id',
    media: base.media,
    tags: base.tags,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    savedByMe: false,
    isMine: false,
    createdAt: base.createdAt,
    video: PostVideo(
      status: 'ready',
      playbackUrl: 'https://cdn.test/$id.m3u8',
      durationSec: 30,
    ),
  );
}

class _Reels extends ReelsRepository {
  _Reels() : super(apiDio: Dio(), storageDio: Dio());

  @override
  Future<CursorPage<Post>> reels({String? cursor, String? practice}) async =>
      CursorPage(items: [_reel('r1'), _reel('r2')]);
}

/// Posts | Reels side by side, wired like the feed (FeedScreen).
class _Feed extends StatefulWidget {
  const _Feed();

  @override
  State<_Feed> createState() => _FeedState();
}

class _FeedState extends State<_Feed> {
  String _tab = 'posts';
  final _presence = ValueNotifier<ReelsPresence>(ReelsPresence.away);

  @override
  void dispose() {
    _presence.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SwipePages<String>(
        value: _tab,
        values: const ['posts', 'reels'],
        onChanged: (v) => setState(() => _tab = v),
        onSettled: (v) => _presence.value = switch (v) {
          null => ReelsPresence.moving,
          'reels' => ReelsPresence.settled,
          _ => ReelsPresence.away,
        },
        pageBuilder: (_, v) => v == 'reels'
            ? ReelsScreen(embedded: true, presence: _presence)
            : const Center(child: Text('posts')),
      );
}

void main() {
  setUpAll(initializeDateFormatting);

  final players = <_FakePlayer>[];
  late List<Override> base;
  setUp(() async {
    players.clear();
    debugReelPlayerFactory = (_, __) {
      final p = _FakePlayer();
      players.add(p);
      return p;
    };
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      referralOffOverride,
      promotionsOffOverride,
      reelsRepositoryProvider.overrideWithValue(_Reels()),
    ];
  });
  tearDown(() => debugReelPlayerFactory = null);

  List<_FakePlayer> live() => [
        for (final p in players)
          if (!p.disposed) p,
      ];

  Future<void> pumpFeed(WidgetTester tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const _Feed(),
        theme: AppTheme.dark(),
        size: narrowPhone,
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: base,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('sliding into Reels opens no player until the page settles',
      (tester) async {
    await pumpFeed(tester);
    expect(players, isEmpty);

    // The finger drags the Reels page in and holds it there.
    final width = narrowPhone.width;
    final g = await tester.startGesture(Offset(width - 20, 300));
    for (var i = 0; i < 12; i++) {
      await g.moveBy(Offset(-width * 0.06, 0));
      await tester.pump(const Duration(milliseconds: 16));
    }
    // Reels page is built (its first reel is there) but no player opened.
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(ReelVideo), findsWidgets);
    expect(players, isEmpty, reason: 'no video player during the slide');

    // Let go: the page settles on Reels, the first reel opens and plays.
    await g.up();
    await tester.pumpAndSettle();
    expect(live(), isNotEmpty);
    final first = players.first;
    expect(first.value.isPlaying, isTrue);
    expect(tester.takeException(), isNull);

    // Back to Posts: once settled there, every player is closed.
    await tester.fling(
      find.byType(ReelsScreen),
      Offset(width * 0.8, 0),
      1500,
    );
    await tester.pumpAndSettle();
    expect(find.text('posts'), findsOneWidget);
    expect(live(), isEmpty, reason: 'players of an off-screen page closed');
    expect(first.disposed, isTrue);
  });

  testWidgets('rapid back-and-forth swipes settle and leave one player',
      (tester) async {
    await pumpFeed(tester);
    final width = narrowPhone.width;
    for (var i = 0; i < 6; i++) {
      final g = await tester.startGesture(Offset(width / 2, 300));
      final dx = i.isEven ? -width * 0.7 : width * 0.7;
      for (var s = 0; s < 4; s++) {
        await g.moveBy(Offset(dx / 4, 0));
        await tester.pump(const Duration(milliseconds: 8));
      }
      await g.up();
      // The next swipe comes before this slide is over.
      await tester.pump(const Duration(milliseconds: 60));
      expect(
        live(),
        isEmpty,
        reason: 'no player opens while the pages slide (swipe $i)',
      );
    }
    // Ends on Posts (an even number of swipes): settles, nothing open.
    await tester.pumpAndSettle();
    expect(find.text('posts'), findsOneWidget);
    expect(live(), isEmpty);

    // One more swipe into Reels: one player once at rest.
    await tester.fling(find.text('posts'), Offset(-width * 0.8, 0), 1500);
    await tester.pumpAndSettle();
    expect(live().where((p) => p.value.isPlaying), hasLength(1));
    expect(tester.takeException(), isNull);
  });
}
