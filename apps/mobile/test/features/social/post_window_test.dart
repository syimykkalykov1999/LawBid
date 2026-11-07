import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/posts_feed_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

class _Flags extends FeatureFlagsController {
  _Flags({required this.on});

  final bool on;

  @override
  FeatureFlagsState build() => FeatureFlagsState(
        flags: {...defaultFeatureFlags}..['web_post_window'] = on,
        appConfig: const {},
      );

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
}

const _photo = PostMedia(
  fileId: 'f',
  url: 'https://example.test/1.jpg',
  previewUrl: 'https://example.test/1_320.jpg',
  mediumUrl: 'https://example.test/1_1080.jpg',
  width: 1080,
  height: 1080,
);

Post _post(String id) {
  final base = fakePost(id);
  return Post(
    id: id,
    author: base.author,
    body: 'caption of $id',
    media: const [_photo],
    tags: const [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    savedByMe: false,
    isMine: false,
    createdAt: DateTime(2026, 10, 20, 10),
  );
}

void main() {
  setUpAll(initializeDateFormatting);
  tearDown(() => adaptiveShellOverride = null);

  final posts = [_post('a'), _post('b'), _post('c')];

  Future<void> open(
    WidgetTester t, {
    required Size size,
    required bool flag,
    bool web = true,
  }) async {
    adaptiveShellOverride = web;
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () =>
                  PostsFeedScreen.open(context, posts: posts, index: 1),
              child: const Text('open'),
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: size,
        overrides: uxOverrides(
          social: FakeSocialRepository(),
          extra: [
            featureFlagsControllerProvider.overrideWith(
              () => _Flags(on: flag),
            ),
          ],
        ),
      ),
    );
    await t.tap(find.text('open'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
  }

  bool shows(String id) => find
      .textContaining('caption of $id', findRichText: true)
      .evaluate()
      .isNotEmpty;

  testWidgets('wide window: arrows and keys walk the list, ends have no arrow',
      (t) async {
    await open(t, size: const Size(1400, 900), flag: true);
    expect(find.byKey(const ValueKey('post-window')), findsOneWidget);
    expect(find.byType(PostsFeedScreen), findsNothing);
    expect(shows('b'), isTrue);

    await t.tap(find.byKey(const ValueKey('post-window-next')));
    await t.pump(const Duration(milliseconds: 300));
    expect(shows('c'), isTrue);
    expect(find.byKey(const ValueKey('post-window-next')), findsNothing);

    await t.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await t.pump(const Duration(milliseconds: 300));
    expect(shows('b'), isTrue);
    await t.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await t.pump(const Duration(milliseconds: 300));
    expect(shows('a'), isTrue);
    expect(find.byKey(const ValueKey('post-window-prev')), findsNothing);
  });

  testWidgets('the picture lies beside the card, not inside it', (t) async {
    await open(t, size: const Size(1400, 900), flag: true);
    expect(find.byType(PostMediaCarousel), findsOneWidget);
    final card = t.getRect(find.byType(PostCard));
    final photo = t.getRect(find.byType(PostMediaCarousel));
    expect(photo.right, lessThanOrEqualTo(card.left));
    final window = t.getRect(find.byKey(const ValueKey('post-window')));
    expect(window.height, lessThanOrEqualTo(900));
    expect(_fits(window, const Size(1400, 900)), isTrue);
  });

  testWidgets('switch off: the scrolling page as before', (t) async {
    await open(t, size: const Size(1400, 900), flag: false);
    expect(find.byKey(const ValueKey('post-window')), findsNothing);
    expect(find.byType(PostsFeedScreen), findsOneWidget);
  });

  testWidgets('a phone: the scrolling page, whatever the switch', (t) async {
    await open(t, size: const Size(390, 844), flag: true, web: false);
    expect(find.byKey(const ValueKey('post-window')), findsNothing);
    expect(find.byType(PostsFeedScreen), findsOneWidget);
  });

  testWidgets('a narrow website window: the scrolling page', (t) async {
    await open(t, size: const Size(700, 844), flag: true);
    expect(find.byKey(const ValueKey('post-window')), findsNothing);
    expect(find.byType(PostsFeedScreen), findsOneWidget);
  });
}

bool _fits(Rect r, Size s) =>
    r.left >= 0 && r.top >= 0 && r.right <= s.width && r.bottom <= s.height;
