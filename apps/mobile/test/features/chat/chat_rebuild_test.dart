// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/perf/build_counter.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';

import 'contact_info_test.dart';

/// Owner 2026-10-26 (smoothness, Instagram / Telegram / WhatsApp feel):
/// scrolling the chat and the other side typing must not rebuild the whole
/// screen or every visible bubble. Debug build counters prove it.
List<ChatMessage> _history(int n) => [
      for (var i = n - 1; i >= 0; i--)
        ChatMessage(
          id: 'm$i',
          conversationId: 'c1',
          kind: MessageKind.text,
          body: 'message $i',
          senderId: i.isEven ? 'u2' : 'me',
          createdAt: DateTime(2026, 10).add(Duration(hours: i * 3)),
        ),
    ];

void _test(String name, Future<void> Function(WidgetTester) body) {
  testWidgets(name, (tester) async {
    await body(tester);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
  });
}

Future<StreamController<RealtimeEvent>> _open(WidgetTester tester) async {
  final events = StreamController<RealtimeEvent>.broadcast();
  addTearDown(events.close);
  final chat = FakeContactChat(makeConv())..textMessages.addAll(_history(80));
  await pumpContact(
    tester,
    contactTestApp(
      chat,
      const ConversationScreen(conversationId: 'c1'),
      pushed: [],
      extra: [realtimeEventsProvider.overrideWithValue(events.stream)],
    ),
  );
  return events;
}

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  setUp(() {
    BuildCounter.reset();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
  });

  _test('a slow scroll does not rebuild the list or the visible bubbles',
      (tester) async {
    await _open(tester);
    BuildCounter.reset();
    final g = await tester.startGesture(
      tester.getCenter(find.byType(Scrollable).first),
    );
    // 40 frames of a finger moving up the history (800 px in all).
    for (var i = 0; i < 40; i++) {
      await g.moveBy(const Offset(0, 20));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
    await tester.pumpAndSettle(const Duration(milliseconds: 16));
    final list = BuildCounter.of('chat.list');
    final rows = BuildCounter.of('chat.row');
    final screen = BuildCounter.of('chat.screen');
    // ignore: avoid_print
    print('scroll 40 frames: screen=$screen list=$list rows=$rows');
    // The list itself rebuilds at most when the pill / date chip flips
    // (it used to rebuild on every frame); rows build only as they scroll
    // into view (800 px is about 12 new rows).
    expect(screen, 0);
    expect(list, lessThanOrEqualTo(1));
    expect(rows, lessThan(30));
    // Still works: the pill and the date chip are there.
    expect(find.byKey(const ValueKey('scroll-to-bottom')), findsOneWidget);
    expect(find.byKey(const ValueKey('sticky-date')), findsOneWidget);
  });

  _test('the other side typing does not rebuild the screen or the list',
      (tester) async {
    final events = await _open(tester);
    BuildCounter.reset();
    events.add(
      const RealtimeEvent('typing', {'conversationId': 'c1', 'typing': true}),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    events.add(
      const RealtimeEvent('typing', {'conversationId': 'c1', 'typing': false}),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    final list = BuildCounter.of('chat.list');
    final screen = BuildCounter.of('chat.screen');
    // ignore: avoid_print
    print('typing on+off: screen=$screen list=$list');
    expect(screen, 0);
    expect(list, 0);
  });
}
