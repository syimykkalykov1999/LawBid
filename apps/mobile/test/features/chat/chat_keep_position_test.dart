import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';

import 'contact_info_test.dart';

/// Audit 26.10 B3 (Telegram / WhatsApp): while the person reads older
/// messages, a new incoming one lands below without moving the text under
/// the finger.
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

Map<String, Object?> _incoming(String id, DateTime at) => {
      'message': {
        'id': id,
        'conversationId': 'c1',
        'senderId': 'u2',
        'type': 'text',
        'body': 'a new one\nwith two lines',
        'contactMasked': false,
        'createdAt': at.toUtc().toIso8601String(),
        'revoked': false,
        'forwarded': false,
        'reactions': <Object?>[],
        'pinned': false,
      },
    };

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
  });

  for (final up in const [450.0, 2000.0]) {
    testWidgets('a new message does not move what is read ($up px up)',
        (tester) async {
      final events = StreamController<RealtimeEvent>.broadcast();
      addTearDown(events.close);
      final chat = FakeContactChat(makeConv())
        ..textMessages.addAll(_history(80));
      await pumpContact(
        tester,
        contactTestApp(
          chat,
          const ConversationScreen(conversationId: 'c1'),
          pushed: [],
          extra: [
            realtimeEventsProvider.overrideWithValue(events.stream),
            // No on-device copy: its trim timer outlives the test.
            messageStoreProvider.overrideWithValue(null),
          ],
        ),
      );
      final list = find.byType(Scrollable).first;
      final view = tester.getRect(list);
      final g = await tester.startGesture(view.center);
      for (var moved = 0.0; moved < up; moved += 25) {
        await g.moveBy(const Offset(0, 25));
        await tester.pump(const Duration(milliseconds: 16));
      }
      await g.up();
      await tester.pumpAndSettle();
      // A message in the middle of the screen.
      Finder? watched;
      for (var i = 79; i >= 0; i--) {
        final f = find.text('message $i');
        if (f.evaluate().isEmpty) continue;
        final y = tester.getCenter(f).dy;
        if (y > view.top + view.height * 0.3 &&
            y < view.top + view.height * 0.7) {
          watched = f;
          break;
        }
      }
      expect(watched, isNotNull);
      final before = tester.getTopLeft(watched!).dy;
      events.add(
        RealtimeEvent(
          'message:new',
          _incoming('n1', DateTime(2026, 10).add(const Duration(days: 20))),
        ),
      );
      // Every frame after the event, not only the last one: no jump.
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 16));
        expect(
          tester.getTopLeft(watched).dy,
          closeTo(before, 0.5),
          reason: 'frame $i',
        );
      }
      await tester.pumpWidget(const SizedBox());
      // The read receipt's network retry runs out after the tree is gone.
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(seconds: 5));
      }
    });
  }
}
