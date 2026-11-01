import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show IdentityAvatar;
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28: a brief's header is the very header of a photo post:
/// same avatar size and place, the name block starting at the avatar's top,
/// the brief's text on the name's left edge.
const _photo = PostMedia(
  fileId: 'f',
  url: 'https://example.test/1.jpg',
  previewUrl: 'https://example.test/1_320.jpg',
  mediumUrl: 'https://example.test/1_1080.jpg',
  width: 1080,
  height: 1080,
);

const _author = PostAuthor(
  id: 'a1',
  username: 'syimyk',
  firstName: 'Syimyk',
  lastName: 'Kalykov',
  verified: true,
);

Post _post({required bool photo}) => Post(
      id: photo ? 'p' : 'b',
      author: _author,
      body: photo ? '' : 'Three things to know before the interview.',
      media: photo ? const [_photo] : const [],
      tags: const [],
      likeCount: 3,
      commentCount: 2,
      likedByMe: false,
      savedByMe: false,
      isMine: false,
      createdAt: DateTime(2026, 10, 20, 10),
    );

void main() {
  setUpAll(initializeDateFormatting);

  Widget page(ThemeData theme) => Scaffold(
        body: SingleChildScrollView(
          child: Column(
            children: [
              PostCard(key: const ValueKey('brief'), post: _post(photo: false)),
              const Divider(),
              PostCard(key: const ValueKey('post'), post: _post(photo: true)),
            ],
          ),
        ),
      );

  Future<void> pump(WidgetTester t, ThemeData theme) async {
    t.view.physicalSize = const Size(400, 1000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        page(theme),
        theme: theme,
        size: const Size(400, 1000),
        overrides: uxOverrides(social: FakeSocialRepository()),
      ),
    );
    await t.pump(const Duration(seconds: 1));
  }

  testWidgets('brief header = post header geometry', (t) async {
    await pump(t, AppTheme.light());
    Rect avatar(String card) => t.getRect(
          find
              .descendant(
                of: find.byKey(ValueKey(card)),
                matching: find.byType(IdentityAvatar),
              )
              .first,
        );
    Rect name(String card) => t.getRect(
          find
              .descendant(
                of: find.byKey(ValueKey(card)),
                matching: find.text('Syimyk Kalykov'),
              )
              .first,
        );
    final ab = avatar('brief');
    final ap = avatar('post');
    expect(ab.size, ap.size);
    expect(ab.left, ap.left);
    final nb = name('brief');
    final np = name('post');
    expect(nb.left, np.left);
    // Same distance from the avatar's top to the name in both.
    expect(nb.top - ab.top, closeTo(np.top - ap.top, 0.5));
    // The name starts at the avatar's top half, not below its centre.
    expect(nb.top - ab.top, lessThan(ab.height / 2));
    // The «…» menu has the same right edge in both.
    Rect menu(String card) => t.getRect(
          find
              .descendant(
                of: find.byKey(ValueKey(card)),
                matching: find.byIcon(AppIcons.moreHorizRounded),
              )
              .first,
        );
    expect(menu('brief').right, closeTo(menu('post').right, 0.5));
    // The brief's text starts on the name's left edge.
    final text = t.getRect(find.textContaining('Three things').first);
    expect(text.left, closeTo(nb.left, 0.5));
  });

  for (final e
      in {'light': AppTheme.light(), 'dark': AppTheme.dark()}.entries) {
    testGoldens('brief header vs post header - ${e.key}', (t) async {
      await pump(t, e.value);
      // No waitForAssets: the photo post's network image never resolves.
      await expectLater(
        find.byType(Scaffold).first,
        matchesGoldenFile('goldens/brief_header_${e.key}.png'),
      );
    });
  }
}
