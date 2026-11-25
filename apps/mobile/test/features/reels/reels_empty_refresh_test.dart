import 'package:dio/dio.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
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

/// 18.11 (owner's Samsung): «Пока нет рилсов» stayed on the Reels tab after
/// his reels were ready — the empty state could not be pulled down, and
/// after an empty first page nothing was read again. Pulling down on the
/// empty state now reads the first page fresh, like the player does.
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
    isMine: true,
    createdAt: base.createdAt,
    video: PostVideo(
      status: 'ready',
      playbackUrl: 'https://cdn.test/$id.m3u8',
      durationSec: 30,
    ),
  );
}

/// Empty until the server has the reels, then the two of them.
class _Reels extends ReelsRepository {
  _Reels() : super(apiDio: Dio(), storageDio: Dio());

  bool ready = false;
  final freshCalls = <bool>[];

  @override
  Future<CursorPage<Post>> reels({
    String? cursor,
    String? practice,
    bool fresh = false,
  }) async {
    freshCalls.add(fresh);
    return CursorPage(items: ready ? [_reel('r1'), _reel('r2')] : const []);
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  late _Reels repo;
  late List<Override> base;
  setUp(() async {
    debugReelPlayerFactory = (_, __) => _FakePlayer();
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    repo = _Reels();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      referralOffOverride,
      promotionsOffOverride,
      reelsRepositoryProvider.overrideWithValue(repo),
    ];
  });
  tearDown(() => debugReelPlayerFactory = null);

  for (final embedded in [true, false]) {
    testWidgets(
        'pull down on «Пока нет рилсов» reads the reels '
        '(${embedded ? 'the feed tab' : 'full screen'})', (tester) async {
      useNarrowPhone(tester);
      await tester.pumpWidget(
        uxApp(
          embedded
              ? ReelsScreen(
                  embedded: true,
                  presence: ValueNotifier(ReelsPresence.settled),
                )
              : const ReelsScreen(),
          theme: AppTheme.dark(),
          size: narrowPhone,
          overrides: uxOverrides(
            translator: const StaticTranslatorRu(),
            extra: base,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ReelVideo), findsNothing);

      // The reels became ready on the server meanwhile.
      repo.ready = true;
      await tester.fling(
        find.byType(ReelsScreen),
        const Offset(0, 400),
        1200,
      );
      await tester.pumpAndSettle();

      expect(repo.freshCalls, contains(true));
      expect(find.byType(ReelVideo), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  }
}
