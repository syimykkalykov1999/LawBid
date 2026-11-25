import 'package:dio/dio.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/media/video_prefetch.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// 18.11 (owner, prod b57e5428a, iPhone and Samsung): «рилсы не листаются».
/// A vertical swipe on a reel moves to the next one — in the feed's Reels
/// tab (inside the Posts | Reels pages) and full screen.
class _FakePlayer extends VideoPlayerController {
  _FakePlayer() : super.networkUrl(Uri.parse('https://cdn.test/r.m3u8'));

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
  _Reels({this.prefix = 'r'}) : super(apiDio: Dio(), storageDio: Dio());

  final String prefix;

  @override
  Future<CursorPage<Post>> reels({
    String? cursor,
    String? practice,
    bool fresh = false,
  }) async =>
      CursorPage(items: [for (var i = 1; i <= 5; i++) _reel('$prefix$i')]);
}

class _Feed extends StatefulWidget {
  const _Feed();

  @override
  State<_Feed> createState() => _FeedState();
}

class _FeedState extends State<_Feed> {
  String _tab = 'reels';
  final _presence = ValueNotifier<ReelsPresence>(ReelsPresence.settled);

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

  late List<Override> base;
  setUp(() async {
    debugReelPlayerFactory = (_, __) => _FakePlayer();
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

  /// The reel page the vertical pager rests on.
  double page(WidgetTester tester) {
    final view = tester.widget<PageView>(
      find.byWidgetPredicate(
        (w) => w is PageView && w.scrollDirection == Axis.vertical,
      ),
    );
    return view.controller!.page!;
  }

  Future<void> pump(WidgetTester tester, Widget child) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        child,
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

  /// A finger swipe up, as on the phone: 40 % of the screen in 0.2 s (a
  /// fling the page physics turn into one page).
  Future<void> swipeUp(WidgetTester tester) async {
    await tester.timedDragFrom(
      Offset(narrowPhone.width / 2, narrowPhone.height * 0.7),
      Offset(0, -narrowPhone.height * 0.4),
      const Duration(milliseconds: 200),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('the feed’s Reels tab: a swipe up shows the next reel',
      (tester) async {
    await pump(tester, const _Feed());
    expect(find.byType(ReelVideo), findsWidgets);
    expect(page(tester), 0);
    await swipeUp(tester);
    expect(page(tester), 1);
    await swipeUp(tester);
    expect(page(tester), 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('full screen: a swipe up shows the next reel', (tester) async {
    await pump(tester, const ReelsScreen());
    expect(page(tester), 0);
    await swipeUp(tester);
    expect(page(tester), 1);
    expect(tester.takeException(), isNull);
  });

  /// The owner's case: a reel opened from a feed card is the only one until
  /// the reels list arrives; with the list (the server's fix: a signed-in
  /// viewer's ranked list is never empty) the next reel is a swipe away.
  testWidgets('opened from a feed card: the swipe goes on into the list',
      (tester) async {
    await pump(tester, ReelsScreen(initial: [_reel('card')]));
    expect(page(tester), 0);
    await swipeUp(tester);
    expect(page(tester), 1);
    expect(tester.takeException(), isNull);
  });

  /// 24.11 (owner: «предзагрузки тоже не работают»): the first bytes of the
  /// reels after the first one are fetched as soon as the list is there,
  /// not only after the first swipe (a PageView never reports the page it
  /// starts on, and the warm-up ran only from onPageChanged).
  testWidgets('the reels after the first are warmed before any swipe',
      (tester) async {
    final asked = <String>[];
    final local = Dio()
      ..interceptors.add(
        InterceptorsWrapper(
          onRequest: (o, h) {
            asked.add(o.uri.toString());
            h.resolve(Response(requestOptions: o, data: '', statusCode: 200));
          },
        ),
      );
    final warmer = HlsPrefetcher.instance;
    final smart = warmer.smart;
    final toLocal = warmer.toLocal;
    final allow = warmer.allow;
    warmer
      ..smart = (() => true)
      ..allow = (() => true)
      ..toLocal = ((u) => 'http://127.0.0.1:1/$u')
      ..debugLocalDio = local;
    addTearDown(() {
      warmer
        ..cancelAll()
        ..smart = smart
        ..toLocal = toLocal
        ..allow = allow
        ..debugLocalDio = null;
    });
    // The list of this test (the last override is the reels repository).
    base = [
      ...base.take(base.length - 1),
      reelsRepositoryProvider.overrideWithValue(_Reels(prefix: 'w')),
    ];
    await pump(tester, const ReelsScreen());
    expect(page(tester), 0);
    expect(asked.any((u) => u.contains('w2.m3u8')), isTrue, reason: '$asked');
    expect(asked.any((u) => u.contains('w1.m3u8')), isFalse);
  });
}
