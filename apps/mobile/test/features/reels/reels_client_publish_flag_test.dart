import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-11-04 (R-381): «включить/выключить рилсы для клиентских
/// аккаунтов. Выключено — клиенты не могут публиковать рилсы, могут только
/// смотреть рилсы, которые публикуют адвокаты; фото и брифы клиенты
/// публикуют как раньше. Адвокаты рилсы публикуют всегда».
class _Flags extends FeatureFlagsController {
  _Flags({required this.clientReels});

  final bool clientReels;

  @override
  FeatureFlagsState build() => FeatureFlagsState(
        flags: {...defaultFeatureFlags}
          ..['video_posts'] = true
          ..['reels_client_publish'] = clientReels,
        appConfig: const {},
      );

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
}

void main() {
  Future<void> open(
    WidgetTester tester, {
    required UserRole role,
    required bool clientReels,
  }) async {
    useNarrowPhone(tester);
    final extra = <Override>[
      featureFlagsControllerProvider
          .overrideWith(() => _Flags(clientReels: clientReels)),
      currentUserRoleProvider.overrideWithValue(role),
    ];
    await tester.pumpWidget(
      uxApp(
        const CreatePostScreen(),
        theme: AppTheme.of(AppThemeId.values.first),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(extra: extra),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  // The gallery takes a video (a reel) only while reels may be published.
  final reelGallery = find.text('Up to 9 photos or 1 video');
  final photoGallery = find.text('Up to 9 photos');
  final camera = find.byKey(const ValueKey('post-add-camera'));
  final recordVideo = find.text('Record a video');

  testWidgets('switch off: a client gets photos only, no reel', (
    tester,
  ) async {
    await open(tester, role: UserRole.client, clientReels: false);
    expect(reelGallery, findsNothing);
    expect(photoGallery, findsOneWidget);
    expect(find.text('Photos or videos'), findsNothing);
    // Photos (and briefs) stay: the gallery and camera buttons are there.
    expect(find.byKey(const ValueKey('post-add-gallery')), findsOneWidget);
    expect(camera, findsOneWidget);
  });

  testWidgets('switch on: a client publishes reels', (tester) async {
    await open(tester, role: UserRole.client, clientReels: true);
    expect(reelGallery, findsOneWidget);
    expect(find.text('Photos or videos'), findsOneWidget);
    await tester.tap(camera);
    await tester.pump(const Duration(milliseconds: 500));
    expect(recordVideo, findsOneWidget);
  });

  testWidgets('switch off: an attorney still publishes reels', (
    tester,
  ) async {
    await open(tester, role: UserRole.attorney, clientReels: false);
    expect(reelGallery, findsOneWidget);
    expect(find.text('Photos or videos'), findsOneWidget);
    await tester.tap(camera);
    await tester.pump(const Duration(milliseconds: 500));
    expect(recordVideo, findsOneWidget);
  });
}
