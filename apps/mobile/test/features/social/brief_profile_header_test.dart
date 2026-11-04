import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/promote_case_card.dart'
    show BoostButton;
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show IdentityAvatar;
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28 (R-133, R-136): in a profile's list a brief's header sits
/// exactly where the header of a post sits there: the same avatar place, the
/// name centred on the avatar, the «…» on the same level and the same edge,
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
      isMine: true,
      createdAt: DateTime(2026, 10, 20, 10),
    );

void main() {
  setUpAll(initializeDateFormatting);

  Future<void> pump(WidgetTester t) async {
    t.view.physicalSize = const Size(400, 1000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            child: Column(
              children: [
                PostCard(
                  key: const ValueKey('brief'),
                  post: _post(photo: false),
                  fromProfile: true,
                ),
                PostCard(
                  key: const ValueKey('post'),
                  post: _post(photo: true),
                  fromProfile: true,
                ),
              ],
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(400, 1000),
        overrides: uxOverrides(
          social: FakeSocialRepository(),
          // No network: the Boost pill of my own posts and briefs.
          extra: [
            postPromotionProvider.overrideWith(
              (ref, id) async => const CasePromotionState(
                canPromote: true,
                quote: PromotionQuote(
                  days: 3,
                  priceCentsPerDay: 100,
                  grossCents: 300,
                  totalCents: 300,
                  creditDaysAvailable: 0,
                  creditDaysUsed: 0,
                  maxDays: 30,
                  enabled: true,
                ),
              ),
            ),
          ],
        ),
      ),
    );
    await t.pump(const Duration(seconds: 1));
  }

  testWidgets('profile list: brief header = post header', (t) async {
    await pump(t);
    Rect rect(String card, Finder f) => t.getRect(
          find.descendant(of: find.byKey(ValueKey(card)), matching: f).first,
        );
    // Distances from the card's own top, so the border above a brief does
    // not count.
    Rect local(String card, Finder f) {
      final top = t.getRect(find.byKey(ValueKey(card))).top;
      return rect(card, f).shift(Offset(0, -top));
    }

    for (final f in <Finder>[
      find.byType(IdentityAvatar),
      find.byIcon(AppIcons.moreHorizRounded),
    ]) {
      final b = local('brief', f);
      final p = local('post', f);
      expect(b.left, closeTo(p.left, 0.5));
      // A brief has a hairline on top of its card as well (1 px).
      expect(b.top, closeTo(p.top, 1.01));
      expect(b.size, p.size);
    }
    final avatar = local('brief', find.byType(IdentityAvatar));
    final name = local('brief', find.text('Syimyk Kalykov'));
    expect(
      name.left,
      closeTo(local('post', find.text('Syimyk Kalykov')).left, 0.5),
    );
    // The name is centred on the avatar.
    expect(name.center.dy, closeTo(avatar.center.dy, 1));
    // The brief's text starts on the name's left edge.
    expect(
      rect('brief', find.textContaining('Three things')).left,
      closeTo(name.left, 0.5),
    );
  });

  testWidgets('own brief: «Продвигать» and «…» on one level, same edge',
      (t) async {
    await pump(t);
    final more = t.getRect(
      find
          .descendant(
            of: find.byKey(const ValueKey('brief')),
            matching: find.byIcon(AppIcons.moreHorizRounded),
          )
          .first,
    );
    final boost = t.getRect(
      find
          .descendant(
            of: find.byKey(const ValueKey('brief')),
            matching: find.byType(BoostButton),
          )
          .first,
    );
    expect(boost.center.dy, closeTo(more.center.dy, 0.5));
    expect(boost.right, lessThan(more.left));
    // «…» keeps the post's right edge.
    final postMore = t.getRect(
      find
          .descendant(
            of: find.byKey(const ValueKey('post')),
            matching: find.byIcon(AppIcons.moreHorizRounded),
          )
          .first,
    );
    expect(more.right, closeTo(postMore.right, 0.5));
  });
}
