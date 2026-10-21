import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show ImageSource;
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_form_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_pickers.dart';
import 'package:lawbid/features/channels/presentation/channel_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:visibility_detector/visibility_detector.dart';

import 'channels_fakes.dart';

/// Owner 2026-10-21 (inbox 28): channel pictures like Telegram.
void main() {
  setUpAll(initializeDateFormatting);
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
    debugGalleryImage = (url) => SizedBox(key: ValueKey('full:$url'));
  });
  tearDown(() => debugGalleryImage = null);

  Future<void> pump(
    WidgetTester tester,
    Widget screen,
    FakeChannelsRepository repo, {
    List<Override> extra = const [],
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 1600);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [...channelsOverrides(repo), ...extra],
        child: MaterialApp(theme: AppTheme.light(), home: screen),
      ),
    );
    await tester.pumpAndSettle();
  }

  AppAvatar avatarIn(WidgetTester tester, Finder within) =>
      tester.widget<AppAvatar>(
        find.descendant(of: within, matching: find.byType(AppAvatar)).first,
      );

  testWidgets('a list row shows the picture, or the letters without one',
      (tester) async {
    await pump(
      tester,
      Scaffold(
        body: Column(
          children: [
            ChannelRow(
              key: const ValueKey('with'),
              channel: fakeChannel(avatarUrl: 'https://x.test/a.jpg'),
              onTap: () {},
            ),
            ChannelRow(
              key: const ValueKey('without'),
              channel: fakeChannel(id: 'ch-2'),
              onTap: () {},
            ),
          ],
        ),
      ),
      FakeChannelsRepository(),
    );
    expect(
      avatarIn(tester, find.byKey(const ValueKey('with'))).imageProvider,
      isNotNull,
    );
    final plain = avatarIn(tester, find.byKey(const ValueKey('without')));
    expect(plain.imageProvider, isNull);
    expect(plain.initials, 'TN');
  });

  testWidgets('the header picture opens full screen', (tester) async {
    final repo = FakeChannelsRepository(
      channel: fakeChannel(avatarUrl: 'https://x.test/a.jpg'),
    );
    await pump(tester, const ChannelScreen(channelRef: 'tax_news'), repo);
    await tester.tap(find.byKey(const ValueKey('channel-header-avatar')));
    await tester.pumpAndSettle();
    expect(find.byIcon(AppIcons.closeRounded), findsWidgets);
  });

  testWidgets('without a picture the header tap does nothing', (tester) async {
    await pump(
      tester,
      const ChannelScreen(channelRef: 'tax_news'),
      FakeChannelsRepository(),
    );
    await tester.tap(find.byKey(const ValueKey('channel-header-avatar')));
    await tester.pumpAndSettle();
    expect(find.byType(ChannelScreen), findsOneWidget);
    expect(find.byIcon(AppIcons.closeRounded), findsNothing);
  });

  group('edit form, owner', () {
    testWidgets('camera and gallery are offered, the picker gets the source',
        (tester) async {
      ImageSource? got;
      await pump(
        tester,
        const ChannelFormScreen(channelRef: 'ch-1'),
        FakeChannelsRepository(
          channel: fakeChannel(
            role: ChannelRole.owner,
            avatarUrl: 'https://x.test/a.jpg',
          ),
        ),
        extra: [
          channelAvatarPickerProvider.overrideWithValue(
            (context, source) async {
              got = source;
              return null;
            },
          ),
        ],
      );
      await tester.tap(find.byKey(const ValueKey('channel-avatar')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('channel-avatar-pick')), findsOneWidget);
      expect(
        find.byKey(const ValueKey('channel-avatar-remove')),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const ValueKey('channel-avatar-camera')));
      await tester.pumpAndSettle();
      expect(got, ImageSource.camera);
    });

    testWidgets('no picture, nothing to remove', (tester) async {
      await pump(
        tester,
        const ChannelFormScreen(channelRef: 'ch-1'),
        FakeChannelsRepository(channel: fakeChannel(role: ChannelRole.owner)),
      );
      await tester.tap(find.byKey(const ValueKey('channel-avatar')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('channel-avatar-pick')), findsOneWidget);
      expect(find.byKey(const ValueKey('channel-avatar-remove')), findsNothing);
    });
  });
}
