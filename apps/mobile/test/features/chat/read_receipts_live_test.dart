import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_bubble_parts.dart';
import 'package:lawbid/features/chat/presentation/chat_list_layout.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';

import 'contact_info_test.dart';

/// R-404 (d) (owner 2026-11-04): both people inside the same chat — the
/// recipient's screen acknowledges a message the moment it shows it (one
/// coalesced `read` per burst), and the sender's tick flips to the double
/// «read» tick from the socket event alone, with no re-fetch.
class _Chat extends FakeContactChat {
  _Chat(super.conv);

  final reads = <(String, String)>[];
  int conversationFetches = 0;

  @override
  Future<Conversation> conversation(String id) async {
    conversationFetches++;
    return conv;
  }

  @override
  Future<void> read(String id, String lastReadMessageId) async {
    reads.add((id, lastReadMessageId));
  }
}

ChatMessage _msg(String id, String from, {int minute = 0}) => ChatMessage(
      id: id,
      conversationId: 'c1',
      senderId: from,
      kind: MessageKind.text,
      body: 'text $id',
      createdAt: DateTime(2026, 1, 1, 12, minute),
    );

Map<String, Object?> _newEvent(String id, String from, {int minute = 0}) => {
      'message': {
        'id': id,
        'conversationId': 'c1',
        'senderId': from,
        'type': 'text',
        'body': 'text $id',
        'contactMasked': false,
        'createdAt': DateTime(2026, 1, 1, 12, minute).toIso8601String(),
        'revoked': false,
        'forwarded': false,
        'reactions': <Object?>[],
        'pinned': false,
      },
    };

Finder _tick(IconData icon) => find.byWidgetPredicate(
      (w) =>
          w is ChatTicks &&
          ChatTicks.iconFor(w.delivery, seen: w.seen, delivered: w.delivered) ==
              icon,
    );

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

  /// Disposes the tree and lets the store's trim and the network retry
  /// timers (a real message event in a widget test) run out.
  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 6));
  }

  testWidgets(
      'sender: an incoming message:read flips the tick in place, no re-fetch',
      (tester) async {
    final chat = _Chat(makeConv())..textMessages.add(_msg('m1', 'me'));
    final events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
        extra: [
          realtimeEventsProvider.overrideWithValue(events.stream),
          // No phone copy here: its trim timer would outlive the test.
          messageStoreProvider.overrideWithValue(null),
        ],
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('text m1'), findsOneWidget);
    expect(_tick(AppIcons.doneAllRounded), findsNothing);
    final fetches = chat.conversationFetches;

    events.add(
      RealtimeEvent('message:read', {
        'conversationId': 'c1',
        'lastReadMessageId': 'm1',
        'readAt': DateTime(2026).toIso8601String(),
      }),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(_tick(AppIcons.doneAllRounded), findsOneWidget);
    expect(chat.conversationFetches, fetches);
    await close(tester);
  });

  testWidgets(
      'recipient: a burst of messages arriving while the chat is on screen '
      'is ONE read ack (the newest), after a short coalesce', (tester) async {
    final chat = _Chat(makeConv())..textMessages.add(_msg('m0', 'u2'));
    final events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
        extra: [
          realtimeEventsProvider.overrideWithValue(events.stream),
          // No phone copy here: its trim timer would outlive the test.
          messageStoreProvider.overrideWithValue(null),
        ],
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));
    // Opening the chat read m0.
    expect(chat.reads, [('c1', 'm0')]);

    events
      ..add(RealtimeEvent('message:new', _newEvent('m1', 'u2', minute: 1)))
      ..add(RealtimeEvent('message:new', _newEvent('m2', 'u2', minute: 2)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    // Inside the coalesce window: nothing sent yet.
    expect(chat.reads, [('c1', 'm0')]);
    await tester.pump(const Duration(milliseconds: 400));
    expect(chat.reads, [('c1', 'm0'), ('c1', 'm2')]);
    await close(tester);
  });

  test('ChatListLayout: the read boundary marks my message as seen', () {
    final layout = ChatListLayout.of(
      items: [_msg('m2', 'me', minute: 2), _msg('m1', 'me', minute: 1)],
      me: 'me',
      lastReadId: 'm1',
      lastDeliveredId: null,
    );
    expect(layout.seen(1), isTrue);
    expect(layout.seen(0), isFalse);
  });
}
