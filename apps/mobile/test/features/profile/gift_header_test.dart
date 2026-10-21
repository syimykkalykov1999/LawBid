import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_handle_bar.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid/features/stars/presentation/gift_widgets.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-21: the «Gifts» block under the name moved to a gift icon
/// in the profile's top bar — second from the left, next to the scales, the
/// size of the QR code and the gear.
const _gift = Gift(id: 'g1', title: 'Rose', priceStars: 10);

void main() {
  Future<GoRouter> pump(
    WidgetTester tester, {
    required bool isMe,
    List<GiftSend> gifts = const [],
  }) async {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => Scaffold(
            appBar: ProfileHandleBar(
              handle: 'ann',
              leading: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox.square(dimension: AppSizes.touchTarget),
                  GiftHeaderButton(userId: 'u1', isMe: isMe),
                ],
              ),
              actions: const [
                SizedBox.square(
                  key: ValueKey('qr'),
                  dimension: AppSizes.touchTarget,
                ),
                SizedBox.square(dimension: AppSizes.touchTarget),
              ],
            ),
          ),
        ),
        GoRoute(
          path: AppRoutes.myGifts,
          builder: (_, __) => const Scaffold(body: Text('my-gifts')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          starsEnabledProvider.overrideWithValue(true),
          giftShowcaseProvider.overrideWith((ref, _) async => gifts),
        ],
        child: MaterialApp.router(
          theme: AppTheme.dark(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('mine: the icon is there, as big as the QR, opens my gifts',
      (tester) async {
    await pump(tester, isMe: true);
    final gift = find.byKey(const ValueKey('profile-gifts'));
    expect(gift, findsOneWidget);
    expect(
      tester.getSize(gift),
      tester.getSize(find.byKey(const ValueKey('qr'))),
    );
    expect(find.byIcon(AppIcons.giftOutlined), findsOneWidget);
    await tester.tap(gift);
    await tester.pumpAndSettle();
    expect(find.text('my-gifts'), findsOneWidget);
  });

  testWidgets("someone else's: only with shown gifts; opens them in a sheet",
      (tester) async {
    await pump(tester, isMe: false);
    expect(find.byKey(const ValueKey('profile-gifts')), findsNothing);
  });

  testWidgets("someone else's with gifts: the sheet lists them",
      (tester) async {
    await pump(
      tester,
      isMe: false,
      gifts: [
        GiftSend(
          id: 's1',
          gift: _gift,
          anonymous: false,
          shown: true,
          createdAt: DateTime(2026, 10, 21),
        ),
      ],
    );
    await tester.tap(find.byKey(const ValueKey('profile-gifts')));
    await tester.pumpAndSettle();
    expect(find.byType(GiftImage), findsOneWidget);
  });
}
