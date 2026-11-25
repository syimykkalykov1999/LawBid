import 'package:dio/dio.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/media/video_prefetch.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
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
  Future<CursorPage<Post>> reels({
    String? cursor,
    String? practice,
    bool fresh = false,
  }) async =>
      CursorPage(items: [for (var i = 1; i <= 6; i++) _reel('r$i')]);
}

/// Owner 24.11 (works check row 71, Instagram / TikTok): the next reels are
/// warmed as soon as Reels opens, not only after the first swipe.
void main() {
  setUpAll(initializeDateFormatting);

  late List<Override> base;
  var asked = 0;
  setUp(() async {
    asked = 0;
    debugReelPlayerFactory = (_, __) => _FakePlayer();
    // Counts the warm-ups the screen asks for (and stops the network).
    HlsPrefetcher.instance.allow = () {
      asked++;
      return false;
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
  tearDown(() {
    debugReelPlayerFactory = null;
    HlsPrefetcher.instance.allow = () => true;
  });

  testWidgets('opening Reels warms the next reels before any swipe',
      (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const ReelsScreen(),
        theme: AppTheme.dark(),
        size: narrowPhone,
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: base,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      asked,
      greaterThanOrEqualTo(2),
      reason: 'the next reels are asked for at once',
    );
  });
}
