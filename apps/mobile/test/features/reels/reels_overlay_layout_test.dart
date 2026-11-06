import 'dart:async';

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
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-11-03 (Instagram): the author row sits right above the nav
/// bar with no caption and rises by the caption's height with one; a
/// loading reel shows its poster, never a black box; the pages coming to
/// rest on a page always make it the chosen one (Samsung: the Reels page
/// on screen with «Посты» lit and its video never playing).

/// A player that never finishes opening (a slow network).
class _SlowPlayer extends VideoPlayerController {
  _SlowPlayer() : super.networkUrl(Uri.parse('https://cdn.test/slow.m3u8'));

  @override
  Future<void> initialize() => Completer<void>().future;

  @override
  Future<void> setVolume(double volume) async {}
}

Post _reel(
  String id, {
  required String body,
  required bool client,
  bool mine = false,
}) =>
    Post(
      id: id,
      author: PostAuthor(
        id: 'a-$id',
        username: 'user$id',
        firstName: 'Name',
        lastName: id,
        verified: !client,
        isClient: client,
      ),
      body: body,
      media: const [],
      tags: const [],
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false,
      isMine: mine,
      createdAt: DateTime(2026, 10, 28),
      video: const PostVideo(status: 'processing'),
    );

class _Reels extends ReelsRepository {
  _Reels() : super(apiDio: Dio(), storageDio: Dio());

  @override
  Future<CursorPage<Post>> reels({
    String? cursor,
    String? practice,
    bool fresh = false,
  }) async =>
      const CursorPage(items: []);
}

void main() {
  setUpAll(initializeDateFormatting);

  late List<Override> base;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      referralOffOverride,
      promotionsOffOverride,
      reelsRepositoryProvider.overrideWithValue(_Reels()),
    ];
  });

  Future<void> show(
    WidgetTester tester,
    Post reel, {
    TextDirection? dir,
    double textScale = 1,
  }) async {
    useNarrowPhone(tester);
    var app = uxApp(
      ReelsScreen(key: ValueKey(reel.id), initial: [reel]),
      theme: AppTheme.dark(),
      size: narrowPhone,
      disableAnimations: true,
      overrides: uxOverrides(
        translator: const StaticTranslatorRu(),
        extra: base,
      ),
    );
    if (dir != null || textScale != 1) {
      app = Directionality(
        textDirection: dir ?? TextDirection.ltr,
        child: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
          child: app,
        ),
      );
    }
    await tester.pumpWidget(app);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.takeException(), isNull);
  }

  double rowBottom(WidgetTester tester) =>
      tester.getBottomLeft(find.byType(AuthorHeader)).dy;

  double railBottom(WidgetTester tester) =>
      tester.getBottomLeft(find.byIcon(AppIcons.moreHorizRounded)).dy;

  testWidgets(
      'no caption: the author row sits just above the nav bar, on '
      'the last rail icon line', (tester) async {
    await show(tester, _reel('2', body: '', client: false, mine: true));
    // The rail's last icon and the author row end on the same line.
    expect(rowBottom(tester), closeTo(railBottom(tester), 0.5));
    expect(find.text('\u00A0'), findsNothing);
  });

  testWidgets('a caption lifts the author row by exactly its height', (
    tester,
  ) async {
    await show(tester, _reel('2', body: '', client: false));
    final none = rowBottom(tester);
    await show(
      tester,
      _reel('1', body: 'What to say at a traffic stop', client: false),
    );
    final oneLine = rowBottom(tester);
    final captionH =
        tester.getSize(find.text('What to say at a traffic stop')).height;
    expect(none - oneLine, closeTo(captionH + AppSpacing.sm, 0.5));
    // Long caption: two lines at most, ending in «ещё».
    await show(tester, _reel('4', body: 'A long caption ' * 20, client: true));
    final twoLines = rowBottom(tester);
    expect(twoLines, lessThan(oneLine));
    expect(find.textContaining('ещё', findRichText: true), findsOneWidget);
    final rich = tester.widget<RichText>(
      find.descendant(
        of: find.byType(ReelsScreen),
        matching: find.byWidgetPredicate(
          (w) => w is RichText && w.text.toPlainText().contains('ещё'),
        ),
      ),
    );
    expect(rich.maxLines, anyOf(isNull, 2));
  });

  testWidgets('the username is centred on the avatar without a second line', (
    tester,
  ) async {
    await show(tester, _reel('3', body: '', client: true));
    final avatar = tester.getRect(find.byType(IdentityAvatar).first);
    final name = tester.getRect(find.byType(AuthorNameLine));
    expect(name.center.dy, closeTo(avatar.center.dy, 0.5));
  });

  testWidgets('RTL and large text keep the row at the bottom, no overflow', (
    tester,
  ) async {
    await show(
      tester,
      _reel('5', body: 'A long caption ' * 20, client: false),
      dir: TextDirection.rtl,
      textScale: 1.6,
    );
    expect(tester.takeException(), isNull);
    expect(rowBottom(tester), lessThanOrEqualTo(railBottom(tester) + 0.5));
  });

  testWidgets('a loading reel shows its poster, not a black box', (
    tester,
  ) async {
    debugReelPlayerFactory = (_, __) => _SlowPlayer();
    addTearDown(() => debugReelPlayerFactory = null);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: const Scaffold(
          body: ReelVideo(
            active: true,
            video: PostVideo(
              status: 'ready',
              playbackUrl: 'https://cdn.test/slow.m3u8',
              thumbnailUrl: 'https://cdn.test/slow.jpg',
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('reel-poster')), findsOneWidget);
    // Sliding in (no player yet): the poster is the placeholder.
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: const Scaffold(
          body: ReelVideo(
            key: ValueKey('deferred'),
            active: true,
            deferOpen: true,
            video: PostVideo(
              status: 'ready',
              playbackUrl: 'https://cdn.test/slow.m3u8',
              thumbnailUrl: 'https://cdn.test/slow.jpg',
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('reel-poster')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('the page the pages rest on becomes the chosen one', (
    tester,
  ) async {
    var value = 'posts';
    var dropNext = true;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) => SwipePages<String>(
            value: value,
            values: const ['posts', 'reels'],
            onChanged: (v) {
              // The first page change is lost on the way (the bug).
              if (dropNext) {
                dropNext = false;
                return;
              }
              setState(() => value = v);
            },
            pageBuilder: (_, v) => Center(child: Text('page-$v')),
          ),
        ),
      ),
    );
    await tester.fling(find.text('page-posts'), const Offset(-600, 0), 1500);
    await tester.pumpAndSettle();
    expect(find.text('page-reels'), findsOneWidget);
    expect(value, 'reels');
  });
}
