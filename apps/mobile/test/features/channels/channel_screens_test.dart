import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/channels/application/channel_compose.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_composer_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_form_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_pickers.dart';
import 'package:lawbid/features/channels/presentation/channel_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart'
    show ChannelRow, ChannelsEmpty;
import 'package:lawbid/features/channels/presentation/channels_groups.dart'
    show SectionCaption;
import 'package:lawbid/features/channels/presentation/channels_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../groups/fake_group_repository.dart';
import 'channels_fakes.dart';

/// Owner 2026-10-20: the channel page and the composer as a reader and an
/// admin use them.
void main() {
  setUpAll(initializeDateFormatting);

  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  Future<void> pump(
    WidgetTester tester,
    Widget screen,
    FakeChannelsRepository repo, {
    List<Override> extra = const [],
    Size size = const Size(390, 1600),
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = size;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [...channelsOverrides(repo), ...extra],
        child: MaterialApp(theme: AppTheme.light(), home: screen),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('channel form', () {
    testWidgets('next on the @username moves the focus to the description',
        (tester) async {
      // A short screen (keyboard open): the description is far below.
      await pump(
        tester,
        const ChannelFormScreen(),
        FakeChannelsRepository(),
        size: const Size(360, 420),
      );

      bool focused(String key) => tester
          .widget<EditableText>(
            find.descendant(
              of: find.byKey(ValueKey(key)),
              matching: find.byType(EditableText),
            ),
          )
          .focusNode
          .hasFocus;

      await tester.tap(find.byKey(const ValueKey('channel-username')));
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey('channel-username')),
        'tax_news',
      );
      await tester.testTextInput.receiveAction(TextInputAction.next);
      await tester.pumpAndSettle();

      expect(focused('channel-description'), isTrue);
      expect(focused('channel-username'), isFalse);
    });
  });

  group('channels list', () {
    testWidgets('no subscriptions is a plain empty state, not an error',
        (tester) async {
      final repo = FakeChannelsRepository();
      await pump(
        tester,
        const ChannelsScreen(),
        repo,
        extra: [
          groupRepositoryProvider.overrideWithValue(FakeGroupRepository([])),
        ],
      );
      expect(find.byType(AppErrorState), findsNothing);
      expect(find.byType(ChannelsEmpty), findsWidgets);
    });

    // Owner 2026-10-21: every tab has «Groups | Channels» on top: groups
    // only under Groups, channels only under Channels, no captions inside.
    testWidgets('Groups | Channels: separate lists, tap and swipe, no captions',
        (tester) async {
      final repo = FakeChannelsRepository()..listed = [fakeChannel()];
      await pump(
        tester,
        const ChannelsScreen(),
        repo,
        extra: [
          groupRepositoryProvider.overrideWithValue(
            FakeGroupRepository([listGroup('g1'), listGroup('g2')]),
          ),
        ],
      );
      expect(find.byKey(const ValueKey('channels-caption')), findsNothing);
      expect(find.byType(SectionCaption), findsNothing);
      expect(find.byType(GroupChatTile), findsNWidgets(2));
      expect(find.byType(ChannelRow), findsNothing);
      // A swipe inside the page goes to Channels.
      await tester.drag(
        find.byKey(const ValueKey('channels-list-groups')).first,
        const Offset(-400, 0),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ChannelRow), findsOneWidget);
      expect(find.byType(GroupChatTile), findsNothing);
      // A tap brings Groups back.
      await tester.tap(find.text('Groups').first);
      await tester.pumpAndSettle();
      expect(find.byType(GroupChatTile), findsNWidgets(2));
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 5));
    });

    testWidgets('Mine, Subscriptions and Discover change by a tap or a swipe',
        (tester) async {
      final repo = FakeChannelsRepository()..listed = [fakeChannel()];
      await pump(tester, const ChannelsScreen(), repo);
      // Owner 2026-10-21 (inbox 34): the screen opens on «Mine».
      expect(repo.calls, contains('list:managed:'));
      expect(repo.calls, isNot(contains('list:subscribed:')));
      await tester.tap(find.text('Discover'));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('recommended:'));
      await tester.tap(find.text('Following'));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('list:subscribed:'));
      // Owner 2026-10-22: every tab swipes. On Following (Groups first),
      // a swipe goes to Channels, the next one carries on to Discover.
      await tester.tap(find.text('Mine'));
      await tester.pumpAndSettle();
      Future<void> swipeLeft() async {
        await tester.drag(
          find.byKey(const ValueKey('channels-list-groups')).first,
          const Offset(-400, 0),
        );
        await tester.pumpAndSettle();
      }

      await swipeLeft();
      expect(
          find.byKey(const ValueKey('channels-list-channels')), findsWidgets);
      await tester.drag(
        find.byKey(const ValueKey('channels-list-channels')).first,
        const Offset(-400, 0),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .getRect(find.byKey(const ValueKey('channels-page-subscribed')))
            .left,
        closeTo(0, 1),
      );
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 5));
    });
  });

  group('channel page', () {
    testWidgets('a reader can subscribe and unsubscribe', (tester) async {
      final repo = FakeChannelsRepository(channel: fakeChannel());
      await pump(
        tester,
        const ChannelScreen(channelRef: 'tax_news'),
        repo,
      );
      expect(find.byKey(const ValueKey('channel-subscribe')), findsOneWidget);
      expect(find.byKey(const ValueKey('channel-new-post')), findsNothing);
      expect(find.byKey(const ValueKey('channel-mute')), findsNothing);

      await tester.tap(find.byKey(const ValueKey('channel-subscribe')));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('subscribe'));
      expect(
        find.byKey(const ValueKey('channel-unsubscribe')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('channel-mute')), findsOneWidget);
      expect(find.textContaining('121'), findsWidgets);

      await tester.tap(find.byKey(const ValueKey('channel-unsubscribe')));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('unsubscribe'));
      expect(find.byKey(const ValueKey('channel-subscribe')), findsOneWidget);
    });

    testWidgets('an admin sees New post and no Subscribe', (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(role: ChannelRole.admin),
      );
      await pump(
        tester,
        const ChannelScreen(channelRef: 'tax_news'),
        repo,
      );
      expect(find.byKey(const ValueKey('channel-new-post')), findsOneWidget);
      expect(find.byKey(const ValueKey('channel-subscribe')), findsNothing);
      expect(find.byKey(const ValueKey('channel-unsubscribe')), findsNothing);
      expect(find.byKey(const ValueKey('channel-post-menu')), findsWidgets);
    });

    testWidgets('a reader has no post menu for editing', (tester) async {
      final repo = FakeChannelsRepository(channel: fakeChannel());
      await pump(
        tester,
        const ChannelScreen(channelRef: 'tax_news'),
        repo,
      );
      await tester.tap(find.byKey(const ValueKey('channel-post-menu')).first);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('channel-post-report')), findsOne);
      expect(find.byKey(const ValueKey('channel-post-edit')), findsNothing);
      expect(find.byKey(const ValueKey('channel-post-delete')), findsNothing);
    });

    testWidgets('tapping a reaction sets it, tapping again removes it',
        (tester) async {
      final repo = FakeChannelsRepository(
        feed: [
          fakePost(
            'p1',
            reactions: const [ChannelReactionCount('👍', 2)],
          ),
        ],
      );
      await pump(
        tester,
        const ChannelScreen(channelRef: 'tax_news'),
        repo,
      );
      final chip = find.byKey(const ValueKey('channel-react-👍'));
      expect(chip, findsOneWidget);
      expect(
        find.descendant(of: chip, matching: find.text('👍 2')),
        findsOneWidget,
      );

      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(repo.calls, contains('react:p1:👍'));
      expect(
        find.descendant(of: chip, matching: find.text('👍 3')),
        findsOneWidget,
      );

      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(repo.calls, contains('unreact:p1'));
      expect(
        find.descendant(of: chip, matching: find.text('👍 2')),
        findsOneWidget,
      );
    });

    testWidgets('comments are on when enabled and hidden when not',
        (tester) async {
      final on = FakeChannelsRepository(channel: fakeChannel());
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), on);
      expect(
        find.byKey(const ValueKey('channel-post-comments')),
        findsWidgets,
      );

      final off = FakeChannelsRepository(
        channel: fakeChannel(comments: false),
      );
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), off);
      expect(find.byKey(const ValueKey('channel-post-comments')), findsNothing);
    });

    testWidgets('shown posts are reported as viewed', (tester) async {
      final repo = FakeChannelsRepository(channel: fakeChannel());
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), repo);
      await tester.pump(const Duration(seconds: 2));
      expect(repo.viewed.expand((e) => e), containsAll(['p1', 'p2']));
    });
  });

  group('composer', () {
    Uint8List px() => Uint8List.fromList([1, 2, 3]);

    List<Override> pickers({int photos = 2}) => [
          channelPhotoPickerProvider.overrideWithValue(
            (context, left) async => [for (var i = 0; i < photos; i++) px()],
          ),
          channelVideoPickerProvider.overrideWithValue(
            (context, max) async => (
              video: ChannelVideoDraft(
                file: XFile.fromData(px(), name: 'v.mp4'),
                durationSec: 5,
                size: 3,
              ),
              problem: null,
            ),
          ),
          channelPhotoUploaderProvider
              .overrideWithValue((bytes, {onProgress}) async => 'f'),
        ];

    bool enabled(WidgetTester tester, String key) {
      final button = tester.widget<AppButton>(find.byKey(ValueKey(key)));
      return button.isEnabled;
    }

    testWidgets('publish needs text and stops at 4000', (tester) async {
      final repo = FakeChannelsRepository();
      await pump(
        tester,
        const ChannelComposerScreen(channelId: 'ch-1'),
        repo,
        extra: pickers(),
      );
      expect(enabled(tester, 'channel-compose-publish'), isFalse);

      await tester.enterText(
        find.byKey(const ValueKey('channel-compose-text')),
        'Hello',
      );
      await tester.pump();
      expect(enabled(tester, 'channel-compose-publish'), isTrue);

      await tester.enterText(
        find.byKey(const ValueKey('channel-compose-text')),
        'x' * (kChannelPostMax + 50),
      );
      await tester.pump();
      final field = tester.widget<TextField>(
        find.descendant(
          of: find.byKey(const ValueKey('channel-compose-text')),
          matching: find.byType(TextField),
        ),
      );
      expect(
        field.controller!.text.length,
        lessThanOrEqualTo(kChannelPostMax),
      );
    });

    testWidgets('photos stop at the limit and exclude a video', (tester) async {
      final repo = FakeChannelsRepository();
      await pump(
        tester,
        const ChannelComposerScreen(channelId: 'ch-1'),
        repo,
        extra: pickers(photos: 10),
      );
      expect(enabled(tester, 'channel-add-photos'), isTrue);
      expect(enabled(tester, 'channel-add-video'), isTrue);

      await tester.tap(find.byKey(const ValueKey('channel-add-photos')));
      await tester.pumpAndSettle();
      expect(find.textContaining('10/10'), findsOneWidget);
      expect(enabled(tester, 'channel-add-photos'), isFalse);
      expect(enabled(tester, 'channel-add-video'), isFalse);
    });

    testWidgets('a video blocks photos', (tester) async {
      final repo = FakeChannelsRepository();
      await pump(
        tester,
        const ChannelComposerScreen(channelId: 'ch-1'),
        repo,
        extra: pickers(),
      );
      await tester.tap(find.byKey(const ValueKey('channel-add-video')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('channel-video-draft')), findsOne);
      expect(enabled(tester, 'channel-add-photos'), isFalse);
      expect(enabled(tester, 'channel-add-video'), isFalse);
    });
  });
}
