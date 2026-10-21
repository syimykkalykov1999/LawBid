import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_form_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_screen.dart';
import 'package:visibility_detector/visibility_detector.dart';

import 'channels_fakes.dart';

/// Owner 2026-10-21 (inbox 26b/26c): channels like Telegram — who
/// publishes, reactions, signatures, pinned posts, silent posts.
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

  group('who publishes (item 2)', () {
    testWidgets('a subscriber of an open channel gets New post',
        (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(
          subscribed: true,
          whoCanPost: ChannelWho.all,
          canPost: true,
        ),
      );
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), repo);
      expect(
        find.byKey(const ValueKey('channel-new-post-member')),
        findsOneWidget,
      );
      // Still a reader: Unsubscribe stays the main button.
      expect(find.byKey(const ValueKey('channel-unsubscribe')), findsOne);
    });

    testWidgets('a subscriber of an admins-only channel has no New post',
        (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(subscribed: true),
      );
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), repo);
      expect(
        find.byKey(const ValueKey('channel-new-post-member')),
        findsNothing,
      );
    });

    testWidgets('the author of a post may edit and delete it', (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(
          subscribed: true,
          whoCanPost: ChannelWho.all,
          canPost: true,
        ),
        feed: [fakePost('p1', own: true)],
      );
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), repo);
      await tester.tap(find.byKey(const ValueKey('channel-post-menu')).first);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('channel-post-edit')), findsOne);
      expect(find.byKey(const ValueKey('channel-post-delete')), findsOne);
      expect(find.byKey(const ValueKey('channel-post-report')), findsNothing);
    });

    testWidgets('the owner opens publishing to all subscribers',
        (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(role: ChannelRole.owner),
      );
      await pump(
        tester,
        const ChannelFormScreen(channelRef: 'tax_news'),
        repo,
      );
      final row = find.byKey(const ValueKey('channel-who-post'));
      await tester.ensureVisible(row);
      await tester.pumpAndSettle();
      await tester.tap(row);
      await tester.pumpAndSettle();
      await tester.tap(find.text('All subscribers'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('channel-form-save')));
      await tester.pumpAndSettle();
      expect(repo.lastDraft?.whoCanPost, ChannelWho.all);
    });

    testWidgets('an admin does not see who publishes', (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(role: ChannelRole.admin),
      );
      await pump(
        tester,
        const ChannelFormScreen(channelRef: 'tax_news'),
        repo,
      );
      expect(find.byKey(const ValueKey('channel-who-post')), findsNothing);
    });
  });

  group('reactions all / selected / off (item 3)', () {
    testWidgets('selected: the picker offers only those', (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(
          subscribed: true,
          reactionsMode: ReactionsMode.some,
          reactionsAllowed: const ['🔥', '👍'],
        ),
        feed: [fakePost('p1')],
      );
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), repo);
      await tester.longPress(
        find.byKey(const ValueKey('channel-post-card-p1')),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('channel-pick-🔥')), findsOne);
      expect(find.byKey(const ValueKey('channel-pick-👍')), findsOne);
      expect(find.byKey(const ValueKey('channel-pick-❤️')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('channel-pick-🔥')));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('react:p1:🔥'));
    });

    testWidgets('all: the whole palette', (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(subscribed: true),
        feed: [fakePost('p1')],
      );
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), repo);
      await tester.longPress(
        find.byKey(const ValueKey('channel-post-card-p1')),
      );
      await tester.pumpAndSettle();
      for (final e in kReactionPalette) {
        expect(find.byKey(ValueKey('channel-pick-$e')), findsOne);
      }
    });

    testWidgets("off: no picker, others' chips do nothing", (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(
          subscribed: true,
          reactionsMode: ReactionsMode.off,
        ),
        feed: [
          fakePost(
            'p1',
            reactions: const [ChannelReactionCount('👍', 2)],
          ),
        ],
      );
      await pump(tester, const ChannelScreen(channelRef: 'tax_news'), repo);
      await tester.longPress(
        find.byKey(const ValueKey('channel-post-card-p1')),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('channel-pick-👍')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('channel-react-👍')));
      await tester.pumpAndSettle();
      expect(repo.calls.where((c) => c.startsWith('react:')), isEmpty);
    });

    testWidgets('an admin narrows the reactions in Manage', (tester) async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(role: ChannelRole.admin),
      );
      await pump(
        tester,
        const ChannelFormScreen(channelRef: 'tax_news'),
        repo,
      );
      final row = find.byKey(const ValueKey('channel-reactions'));
      await tester.ensureVisible(row);
      await tester.pumpAndSettle();
      expect(find.text('All reactions'), findsOne);
      await tester.tap(row);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('reactions-mode-some')));
      await tester.pumpAndSettle();
      // The first six are ticked to start with; untick all but 👍.
      for (final e in ['❤️', '🔥', '👏', '😮', '🙏']) {
        await tester.tap(find.byKey(ValueKey('reactions-allow-$e')));
      }
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('reactions-done')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('channel-form-save')));
      await tester.pumpAndSettle();
      expect(repo.lastDraft?.reactionsMode, ReactionsMode.some);
      expect(repo.lastDraft?.reactionsAllowed, ['👍']);
    });
  });
}
