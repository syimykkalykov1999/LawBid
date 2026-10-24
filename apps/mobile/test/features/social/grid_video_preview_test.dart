import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/media/data_saver.dart';
import 'package:lawbid/core/media/video_prefetch.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/application/grid_video_coordinator.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:video_player/video_player.dart';
import 'package:visibility_detector/visibility_detector.dart';

import 'social_fakes.dart';

/// Owner 2026-10-23 (Search grid like Instagram's Explore): posters in the
/// first frame, the first bytes of the visible videos fetched (and dropped
/// when they scroll away), at most two muted previews, nothing on data
/// saver or in the background.

class _Prefetcher extends HlsPrefetcher {
  final asked = <String>[];
  final dropped = <String>[];

  @override
  void prefetch(String url) => asked.add(url);

  @override
  void drop(Iterable<String> urls) => dropped.addAll(urls);
}

class _FakePlayer extends VideoPlayerController {
  _FakePlayer() : super.networkUrl(Uri.parse('https://cdn.test/v.m3u8'));

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
  Future<void> setVolume(double volume) async =>
      value = value.copyWith(volume: volume);

  @override
  Future<void> seekTo(Duration position) async {}

  @override
  Future<void> dispose() async {
    disposed = true;
    await super.dispose();
  }
}

Post _post(String id) {
  final base = fakePost(id);
  return Post(
    id: id,
    author: base.author,
    body: 'Body of $id',
    media: const [],
    tags: base.tags,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    savedByMe: false,
    isMine: false,
    createdAt: DateTime(2026, 10, 23, 12),
    video: PostVideo(
      status: 'ready',
      playbackUrl: 'https://cdn.test/$id/playlist.m3u8',
      thumbnailUrl: 'https://cdn.test/$id/thumb.jpg',
    ),
  );
}

void main() {
  setUpAll(initializeDateFormatting);

  late _Prefetcher prefetcher;
  late GridVideoCoordinator coordinator;
  final players = <_FakePlayer>[];

  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
    prefetcher = _Prefetcher();
    coordinator = GridVideoCoordinator(prefetcher: prefetcher);
    players.clear();
    debugReelPlayerFactory = (_, __) {
      final p = _FakePlayer();
      players.add(p);
      return p;
    };
  });
  tearDown(() => debugReelPlayerFactory = null);

  GridTileState tile(
    int index, {
    double fraction = 1,
    bool visible = true,
    bool video = true,
    List<String> ahead = const [],
  }) =>
      GridTileState(
        index: index,
        fraction: fraction,
        visible: visible,
        url: video ? 'https://cdn.test/$index.m3u8' : null,
        ahead: ahead,
      );

  group('GridVideoCoordinator', () {
    test('prefetches the visible tiles and the ones ahead, nothing else', () {
      coordinator
        ..report('a', tile(0))
        ..report('b', tile(1, fraction: 0.3))
        ..report('c', tile(2, fraction: 0, ahead: ['https://cdn.test/9.m3u8']))
        ..report('d', tile(3, visible: false));
      expect(coordinator.wanted, [
        'https://cdn.test/0.m3u8',
        'https://cdn.test/1.m3u8',
      ]);
      // c is off screen: neither it nor what it lists ahead is wanted.
      expect(prefetcher.asked, isNot(contains('https://cdn.test/2.m3u8')));
      expect(prefetcher.asked, isNot(contains('https://cdn.test/9.m3u8')));
    });

    test('a tile that scrolls far away is dropped', () {
      coordinator
        ..report('a', tile(0))
        ..report('b', tile(1));
      prefetcher.dropped.clear();
      coordinator.report('a', tile(0, fraction: 0));
      expect(prefetcher.dropped, ['https://cdn.test/0.m3u8']);
      coordinator.remove('b');
      expect(prefetcher.dropped, contains('https://cdn.test/1.m3u8'));
    });

    test('at most two previews, the most visible first', () {
      coordinator
        ..report('a', tile(0, fraction: 0.7))
        ..report('b', tile(1, fraction: 0.8))
        ..report('c', tile(2))
        ..report('d', tile(3, fraction: 0.5));
      // c is clearly more visible than a: it takes a's place; b stays.
      expect(coordinator.previewing.toSet(), {'b', 'c'});
      // An equally good tile does not take a running preview over.
      coordinator.report('e', tile(4));
      expect(coordinator.previewing.toSet(), {'b', 'c'});
      // When one scrolls out, the next best takes the free place.
      coordinator.report('b', tile(1, fraction: 0.2));
      expect(coordinator.previewing.toSet(), {'c', 'e'});
    });

    test('no previews and no prefetch on data saver', () {
      coordinator
        ..report('a', tile(0))
        ..setDataSaver(on: true)
        ..report('b', tile(1));
      expect(coordinator.previewing, isEmpty);
      expect(coordinator.wanted, isEmpty);
      expect(prefetcher.dropped, contains('https://cdn.test/0.m3u8'));
      coordinator.setDataSaver(on: false);
      expect(coordinator.previewing, ['a', 'b']);
    });

    test('a tile of a hidden tab / background app does not preview', () {
      coordinator.report('a', tile(0, visible: false));
      expect(coordinator.previewing, isEmpty);
      expect(coordinator.wanted, isEmpty);
    });

    test('photos never preview or prefetch', () {
      coordinator.report('a', tile(0, video: false));
      expect(coordinator.previewing, isEmpty);
      expect(coordinator.wanted, isEmpty);
    });

    test('web: no HLS prefetch, previews still run', () {
      final web = GridVideoCoordinator(prefetcher: prefetcher, web: true)
        ..report('a', tile(0));
      expect(web.previewing, ['a']);
      expect(prefetcher.asked, isEmpty);
    });
  });

  group('Search grid tiles', () {
    final posts = [for (var i = 0; i < 6; i++) _post('p$i')];

    Future<ProviderContainer> pump(WidgetTester tester) async {
      final container = ProviderContainer(
        overrides: [
          gridVideoCoordinatorProvider.overrideWithValue(coordinator),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: Scaffold(
              body: GridView.count(
                crossAxisCount: 3,
                childAspectRatio: 0.75,
                children: [
                  for (var i = 0; i < posts.length; i++)
                    PostGridTile(
                      post: posts[i],
                      semanticLabel: 'p$i',
                      onTap: () {},
                      autoplay: true,
                      showPin: false,
                      index: i,
                      warmAhead: posts.skip(i + 1).take(3).toList(),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
      return container;
    }

    testWidgets(
        'every video tile has its poster in the first frame, '
        'no player yet', (tester) async {
      await pump(tester);
      // The very first frame: posters are there, nothing is loading.
      expect(find.byType(CachedNetworkImage), findsNWidgets(posts.length));
      expect(players, isEmpty);
    });

    testWidgets('at most two players run; the rest show posters',
        (tester) async {
      await pump(tester);
      await tester.pumpAndSettle();
      expect(coordinator.previewing, hasLength(2));
      expect(players, hasLength(2));
      expect(find.byType(ReelVideo), findsNWidgets(2));
      expect(find.byType(CachedNetworkImage), findsWidgets);
      // The visible tiles were handed to the prefetcher.
      expect(prefetcher.asked, contains('https://cdn.test/p0/playlist.m3u8'));
    });

    testWidgets('data saver: posters only, no player, no prefetch',
        (tester) async {
      final container = await pump(tester);
      await tester.pumpAndSettle();
      expect(players, hasLength(2));
      container.read(dataSaverProvider.notifier).set(on: true);
      coordinator.setDataSaver(on: true);
      await tester.pumpAndSettle();
      expect(find.byType(ReelVideo), findsNothing);
      expect(players.every((p) => p.disposed), isTrue);
      expect(coordinator.wanted, isEmpty);
    });

    testWidgets('the app in the background stops the previews', (tester) async {
      await pump(tester);
      await tester.pumpAndSettle();
      expect(coordinator.previewing, hasLength(2));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pumpAndSettle();
      expect(coordinator.previewing, isEmpty);
      expect(find.byType(ReelVideo), findsNothing);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(coordinator.previewing, hasLength(2));
    });
  });
}
