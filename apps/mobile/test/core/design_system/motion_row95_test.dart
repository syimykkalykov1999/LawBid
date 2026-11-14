import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_bubble_parts.dart';
import 'package:lawbid/features/chat/presentation/in_app_message_banner.dart';
import 'package:lawbid/features/chat/presentation/message_context_menu.dart';
import 'package:lawbid/features/stories/presentation/story_hero.dart';
import 'package:lawbid/shared/presentation/edge_swipe.dart';

/// Owner row 95 (2026-11-13): the motion catalog batch and the four look
/// items the owner said yes to. KE 149: nothing here asserts a value on an
/// exact animation frame — only that motion runs, where it starts from,
/// and the settled end state.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final haptics = <String>[];
  setUp(() {
    haptics.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'HapticFeedback.vibrate') {
        haptics.add(call.arguments as String);
      }
      return null;
    });
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  Widget app(Widget child, {bool still = false}) => MaterialApp(
        theme: AppTheme.light(),
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: still),
          child: Scaffold(body: Center(child: child)),
        ),
      );

  group('AppPopIn (F6 / M6 / C7)', () {
    testWidgets('pops only when asked, then rests at full size',
        (tester) async {
      await tester.pumpWidget(app(const AppPopIn(child: Text('new'))));
      expect(
        find.ancestor(
          of: find.text('new'),
          matching: find.byType(ScaleTransition),
        ),
        findsWidgets,
      );
      await tester.pumpAndSettle();
      final scale = tester.widget<ScaleTransition>(
        find
            .ancestor(
              of: find.text('new'),
              matching: find.byType(ScaleTransition),
            )
            .first,
      );
      expect(scale.scale.value, 1);

      await tester.pumpWidget(
        app(
          const AppPopIn(
            key: ValueKey('second'),
            animate: false,
            child: Text('old'),
          ),
        ),
      );
      expect(
        find.ancestor(
          of: find.text('old'),
          matching: find.byType(ScaleTransition),
        ),
        findsNothing,
      );
    });

    testWidgets('reduce motion: no pop', (tester) async {
      await tester.pumpWidget(
        app(const AppPopIn(child: Text('x')), still: true),
      );
      expect(
        find.ancestor(
            of: find.text('x'), matching: find.byType(ScaleTransition)),
        findsNothing,
      );
    });
  });

  group('AppShake (F3 / O4 / K6)', () {
    testWidgets('a shake buzzes the error haptic and swings, then rests',
        (tester) async {
      final c = AppShakeController();
      addTearDown(c.dispose);
      await tester
          .pumpWidget(app(AppShake(controller: c, child: const Text('f'))));
      final rest = tester.getTopLeft(find.text('f'));
      c.shake();
      await tester.pump();
      expect(haptics, ['HapticFeedbackType.errorNotification']);
      var moved = false;
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 16));
        if (tester.getTopLeft(find.text('f')) != rest) moved = true;
      }
      expect(moved, isTrue);
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(find.text('f')).dx, closeTo(rest.dx, 0.5));
    });

    testWidgets('reduce motion: the haptic only', (tester) async {
      final c = AppShakeController();
      addTearDown(c.dispose);
      await tester.pumpWidget(
        app(AppShake(controller: c, child: const Text('f')), still: true),
      );
      final rest = tester.getTopLeft(find.text('f'));
      c.shake();
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 16));
        expect(tester.getTopLeft(find.text('f')), rest);
      }
      expect(haptics, ['HapticFeedbackType.errorNotification']);
    });

    testWidgets('AppOtpField and AppTextField shake when an error appears',
        (tester) async {
      Widget fields(String? error) => app(
            Column(
              children: [
                AppOtpField(
                  onCompleted: (_) {},
                  errorText: error,
                  semanticLabel: 'code',
                ),
                AppTextField(hintText: 'name', errorText: error),
              ],
            ),
          );
      await tester.pumpWidget(fields(null));
      await tester.pumpWidget(fields('Wrong code'));
      await tester.pump();
      expect(
        haptics.where((h) => h == 'HapticFeedbackType.errorNotification'),
        hasLength(2),
      );
      await tester.pumpAndSettle();
      // The same error again: no second shake.
      await tester.pumpWidget(fields('Wrong code'));
      await tester.pump();
      expect(haptics, hasLength(2));
    });
  });

  group('AppCounterRoll (C6)', () {
    testWidgets('a plain number at rest; the changed digit rolls',
        (tester) async {
      Widget count(int n) => app(AppCounterRoll(text: '$n', value: n));
      await tester.pumpWidget(count(19));
      expect(find.text('19'), findsOneWidget);
      await tester.pumpWidget(count(20));
      await tester.pump(const Duration(milliseconds: 50));
      // Mid-roll both the old and the new digits are on screen …
      expect(find.text('1'), findsOneWidget);
      expect(find.text('9'), findsOneWidget);
      expect(find.text('0'), findsOneWidget);
      await tester.pumpAndSettle();
      // … and at rest it is one plain text again.
      expect(find.text('20'), findsOneWidget);
    });

    testWidgets('reduce motion: the number just changes', (tester) async {
      Widget count(int n) =>
          app(AppCounterRoll(text: '$n', value: n), still: true);
      await tester.pumpWidget(count(1));
      await tester.pumpWidget(count(2));
      await tester.pump();
      expect(find.text('2'), findsOneWidget);
      expect(find.text('1'), findsNothing);
    });
  });

  test('AppInsertMotion.fresh: only rows made a moment ago grow in', () {
    final now = DateTime(2026, 11, 13, 12);
    expect(AppInsertMotion.fresh(now, now: now), isTrue);
    expect(
      AppInsertMotion.fresh(now.subtract(const Duration(seconds: 1)), now: now),
      isTrue,
    );
    expect(
      AppInsertMotion.fresh(now.subtract(const Duration(minutes: 1)), now: now),
      isFalse,
    );
  });

  testWidgets(
      'AppInsertMotion: a row added to a shown list grows in; '
      'the rows of a list opening do not', (tester) async {
    Widget list(List<String> rows) => app(
          SizedBox(
            height: 300,
            child: ListView(
              children: [
                for (final r in rows)
                  AppInsertMotion(
                    key: ValueKey(r),
                    animate: true,
                    child: SizedBox(height: 40, child: Text(r)),
                  ),
              ],
            ),
          ),
        );
    await tester.pumpWidget(list(['a']));
    expect(find.byType(SizeTransition), findsNothing);
    await tester.pumpWidget(list(['b', 'a']));
    await tester.pump(const Duration(milliseconds: 16));
    expect(find.byType(SizeTransition), findsOneWidget);
    await tester.pumpAndSettle();
    expect(tester.getSize(find.text('b')).height, 40);
  });

  testWidgets('M3: a tick change cross-fades instead of swapping',
      (tester) async {
    Widget ticks(DeliveryState d, {bool seen = false}) => app(
          ChatTicks(
            delivery: d,
            seen: seen,
            delivered: seen,
            color: Colors.grey,
          ),
        );
    await tester.pumpWidget(ticks(DeliveryState.sending));
    expect(find.byType(AppIcon), findsOneWidget);
    await tester.pumpWidget(ticks(DeliveryState.sent, seen: true));
    await tester.pump(const Duration(milliseconds: 20));
    // The clock is still leaving while the double check comes in.
    expect(find.byType(AppIcon), findsNWidgets(2));
    await tester.pumpAndSettle();
    expect(find.byType(AppIcon), findsOneWidget);
  });

  testWidgets('G1: the swipe ticks at the threshold and springs back',
      (tester) async {
    var ended = 0;
    var far = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EdgeSwipe(
            key: const ValueKey('row'),
            onStart: () {},
            onEnd: () => ended++,
            onEndFar: () => far++,
            startBackground: const ColoredBox(color: Colors.amber),
            endBackground: const ColoredBox(color: Colors.blue),
            endFarBackground: const ColoredBox(color: Colors.red),
            child: const SizedBox(height: 72, child: Text('row')),
          ),
        ),
      ),
    );
    final rect = tester.getRect(find.byKey(const ValueKey('row')));
    final g = await tester.startGesture(Offset(rect.right - 8, rect.center.dy));
    for (var i = 0; i < 10; i++) {
      await g.moveBy(const Offset(-10, 0));
      await tester.pump();
    }
    expect(haptics, ['HapticFeedbackType.selectionClick']);
    for (var i = 0; i < 8; i++) {
      await g.moveBy(const Offset(-10, 0));
      await tester.pump();
    }
    expect(haptics, contains('HapticFeedbackType.lightImpact'));
    await g.up();
    await tester.pumpAndSettle();
    expect(far, 1);
    expect(ended, 0);
    expect(tester.getTopLeft(find.text('row')).dx, closeTo(rect.left, 0.5));
  });

  group('AppPaginatedListView.animateChanges (C3 / C4)', () {
    Widget list(List<String> items) => MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: AppPaginatedListView<String>(
              items: items,
              itemKey: (s) => s,
              animateChanges: true,
              itemBuilder: (_, s, __) => SizedBox(height: 40, child: Text(s)),
              status: AppPaginationStatus.end,
              labels: const AppPaginationLabels(
                loadingMore: 'l',
                retry: 'r',
                error: 'e',
                end: '',
              ),
              onLoadMore: () {},
              onRetry: () {},
            ),
          ),
        );

    testWidgets('a row that jumps to the top collapses and grows in',
        (tester) async {
      await tester.pumpWidget(list(['a', 'b', 'c', 'd']));
      await tester.pumpWidget(list(['d', 'a', 'b', 'c']));
      await tester.pump(const Duration(milliseconds: 30));
      // Its ghost is still collapsing where it was.
      expect(find.text('d'), findsNWidgets(2));
      expect(find.byType(SizeTransition), findsNWidgets(2));
      await tester.pumpAndSettle();
      expect(find.text('d'), findsOneWidget);
      expect(find.byType(SizeTransition), findsNothing);
      double y(String s) => tester.getTopLeft(find.text(s)).dy;
      expect(y('d'), lessThan(y('a')));
      expect(y('a'), lessThan(y('b')));
    });

    testWidgets('a page loaded at the end and the first page never move',
        (tester) async {
      await tester.pumpWidget(list(const []));
      await tester.pumpWidget(list(['a', 'b']));
      await tester.pump();
      expect(find.byType(SizeTransition), findsNothing);
      await tester.pumpWidget(list(['a', 'b', 'c', 'd']));
      await tester.pump();
      expect(find.byType(SizeTransition), findsNothing);
    });

    testWidgets('a removed row collapses, then it is gone', (tester) async {
      await tester.pumpWidget(list(['a', 'b', 'c']));
      await tester.pumpWidget(list(['a', 'c']));
      await tester.pump(const Duration(milliseconds: 30));
      expect(find.text('b'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.text('b'), findsNothing);
    });
  });

  group('Long-press menu route (owner item 1)', () {
    testWidgets('blurred barrier, bar above, menu below; outside closes',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => showMessageContextMenu(
                  context,
                  anchor: const Rect.fromLTWH(40, 300, 200, 60),
                  preview: const ColoredBox(
                    key: ValueKey('bubble'),
                    color: Colors.green,
                  ),
                  reactions: (_) => const MessageReactionBar(
                    children: [Text('👍'), Text('❤️')],
                  ),
                  actions: (_) => const MessageMenuCard(
                    child: Text('Reply', key: ValueKey('act')),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      final bubble = tester.getRect(find.byKey(const ValueKey('bubble')));
      final bar =
          tester.getRect(find.byKey(const ValueKey('msg-reaction-bar')));
      final act = tester.getRect(find.byKey(const ValueKey('act')));
      expect(bar.bottom, lessThanOrEqualTo(bubble.top));
      expect(act.top, greaterThanOrEqualTo(bubble.bottom));
      // The bubble stays where it was in the chat when everything fits.
      expect(bubble.top, closeTo(300, 0.5));
      final route = ModalRoute.of(
        tester.element(find.byKey(const ValueKey('act'))),
      )! as MessageContextMenuRoute;
      expect(route.filter, isNotNull);
      expect(route.barrierColor, MessageContextMenuRoute.barrierTint);
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('act')), findsNothing);
    });

    testWidgets('a bubble near the bottom moves up so the menu fits',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => showMessageContextMenu(
                context,
                anchor: const Rect.fromLTWH(40, 560, 200, 30),
                preview: const ColoredBox(
                  key: ValueKey('bubble'),
                  color: Colors.green,
                ),
                actions: (_) => const SizedBox(
                  key: ValueKey('act'),
                  height: 200,
                  width: 200,
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      final act = tester.getRect(find.byKey(const ValueKey('act')));
      expect(act.bottom, lessThanOrEqualTo(600));
      expect(
        tester.getRect(find.byKey(const ValueKey('bubble'))).top,
        lessThan(560),
      );
    });
  });

  group('In-app message banner rules (owner item 2)', () {
    const them = Counterpart(
      isAttorney: false,
      verified: false,
      id: 'u1',
      displayName: 'Anna',
    );
    Conversation chat({bool muted = false}) => Conversation(
          id: 'c1',
          caseId: null,
          caseTitle: null,
          status: ConversationStatus.active,
          contactsUnlocked: true,
          counterpart: them,
          unreadCount: 1,
          updatedAt: DateTime(2026),
          mutedUntil: muted ? DateTime(2100) : null,
        );
    ChatMessage msg(
            {String sender = 'u1', MessageKind kind = MessageKind.text}) =>
        ChatMessage(
          id: 'm1',
          conversationId: 'c1',
          senderId: sender,
          kind: kind,
          body: 'Hi',
          createdAt: DateTime(2026),
        );
    Conversation? rule(
      ChatMessage m, {
      bool foreground = true,
      bool open = false,
      bool messagesOn = true,
      Conversation? known,
    }) =>
        inAppBannerChat(
          m,
          me: 'me',
          foreground: foreground,
          open: open,
          messagesOn: messagesOn,
          known: known,
        );

    test('shown for a message in another chat', () {
      expect(rule(msg(), known: chat())?.id, 'c1');
    });
    test('never for the open chat, a muted one, or with Messages off', () {
      expect(rule(msg(), known: chat(), open: true), isNull);
      expect(rule(msg(), known: chat(muted: true)), isNull);
      expect(rule(msg(), known: chat(), messagesOn: false), isNull);
    });
    test(
        'never for my own message, a call line, the background, or a '
        'chat whose mute is unknown', () {
      expect(rule(msg(sender: 'me'), known: chat()), isNull);
      expect(rule(msg(kind: MessageKind.call), known: chat()), isNull);
      expect(rule(msg(), known: chat(), foreground: false), isNull);
      expect(rule(msg()), isNull);
    });
  });

  testWidgets('AppTopBannerSwitcher slides the banner in over the content',
      (tester) async {
    Widget host({required bool on}) => MaterialApp(
          home: Stack(
            children: [
              const Positioned.fill(
                child: Align(
                  alignment: Alignment.topLeft,
                  child: Text('content'),
                ),
              ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: AppTopBannerSwitcher(
                  child: on
                      ? const SizedBox(
                          key: ValueKey('banner'),
                          height: 60,
                          child: ColoredBox(color: Colors.red),
                        )
                      : null,
                ),
              ),
            ],
          ),
        );
    await tester.pumpWidget(host(on: false));
    final content = tester.getTopLeft(find.text('content'));
    await tester.pumpWidget(host(on: true));
    await tester.pump(const Duration(milliseconds: 30));
    expect(
      tester.getTopLeft(find.byKey(const ValueKey('banner'))).dy,
      lessThan(0),
    );
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.byKey(const ValueKey('banner'))).dy, 0);
    // Nothing under it moved.
    expect(tester.getTopLeft(find.text('content')), content);
    await tester.pumpWidget(host(on: false));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner')), findsNothing);
  });

  testWidgets('ME5: StoryHero is a Hero, off under reduce motion',
      (tester) async {
    await tester.pumpWidget(
      app(const StoryHero(tag: 't', child: SizedBox(width: 10, height: 10))),
    );
    expect(find.byType(Hero), findsOneWidget);
    expect(tester.widget<HeroMode>(find.byType(HeroMode)).enabled, isTrue);
    await tester.pumpWidget(
      app(
        const StoryHero(tag: 't', child: SizedBox(width: 10, height: 10)),
        still: true,
      ),
    );
    expect(tester.widget<HeroMode>(find.byType(HeroMode)).enabled, isFalse);
  });

  test(
      'N10 / K2 / F4: sheets snap, the chats hide the keyboard on drag, '
      'finished work is a success haptic', () {
    String read(String p) => File(p).readAsStringSync();
    final sheets = [
      'lib/core/l10n/widgets/language_picker_sheet.dart',
      'lib/features/stickers/presentation/sticker_widgets.dart',
      'lib/features/cases/workspace/compose_sheet.dart',
      'lib/features/cases/workspace/tasks_tab.dart',
      'lib/features/team/presentation/team_screen.dart',
      'lib/features/team/presentation/task_sheet.dart',
      'lib/features/onboarding/presentation/widgets/option_picker_sheet.dart',
    ];
    for (final p in sheets) {
      final code = read(p);
      expect(
        'DraggableScrollableSheet('.allMatches(code).length,
        'snap: true'.allMatches(code).length,
        reason: p,
      );
    }
    for (final p in [
      'lib/features/chat/presentation/conversation_screen.dart',
      'lib/features/groups/presentation/group_conversation_screen.dart',
    ]) {
      expect(
        read(p),
        contains('ScrollViewKeyboardDismissBehavior.onDrag'),
        reason: p,
      );
    }
    for (final p in [
      'lib/features/team/presentation/tasks_tab.dart',
      'lib/features/qr/presentation/qr_scanner_screen.dart',
    ]) {
      expect(read(p), contains('AppHaptics.success()'), reason: p);
    }
  });
}
