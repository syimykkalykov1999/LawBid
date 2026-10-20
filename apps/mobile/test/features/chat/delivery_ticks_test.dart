// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';

class _Chat implements ChatRepository {
  final acks = <(String, String)>[];

  @override
  Future<void> delivered(String id, String messageId) async {
    acks.add((id, messageId));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

Map<String, Object?> _event(String id, String sender, {String type = 'text'}) =>
    {
      'message': {
        'id': id,
        'conversationId': 'c1',
        'senderId': sender,
        'type': type,
        'body': 'hi',
        'contactMasked': false,
        'createdAt': DateTime(2026).toIso8601String(),
        'revoked': false,
        'forwarded': false,
        'reactions': <Object?>[],
        'pinned': false,
      },
    };

void main() {
  late _Chat chat;
  late StreamController<RealtimeEvent> events;
  late ProviderContainer c;

  setUp(() {
    chat = _Chat();
    events = StreamController<RealtimeEvent>.broadcast();
    final db = SocialLocalDatabase(NativeDatabase.memory());
    c = ProviderContainer(
      overrides: [
        chatRepositoryProvider.overrideWithValue(chat),
        socialLocalDatabaseProvider.overrideWithValue(db),
        currentUserIdProvider.overrideWithValue('me'),
        realtimeEventsProvider.overrideWithValue(events.stream),
      ],
    );
    addTearDown(() async {
      await events.close();
      c.dispose();
      await db.close();
    });
    c.read(deliveryAckerProvider);
  });

  Future<void> wait() =>
      Future<void>.delayed(const Duration(milliseconds: 500));

  test('a message from the other side is acknowledged once, the newest one',
      () async {
    events
      ..add(RealtimeEvent('message:new', _event('m1', 'them')))
      ..add(RealtimeEvent('message:new', _event('m2', 'them')));
    await wait();
    expect(chat.acks, [('c1', 'm2')]);
  });

  test('my own echo and call entries are not acknowledged', () async {
    events
      ..add(RealtimeEvent('message:new', _event('m1', 'me')))
      ..add(RealtimeEvent('message:new', _event('m2', 'them', type: 'call')));
    await wait();
    expect(chat.acks, isEmpty);
  });

  test('receipts move only the fields they carry', () {
    final conv = Conversation(
      id: 'c1',
      caseId: null,
      caseTitle: 't',
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(isAttorney: false, verified: false),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      counterpartLastReadId: 'r1',
    );
    final delivered = conv.withReceipts(deliveredId: 'd9');
    expect(delivered.counterpartLastDeliveredId, 'd9');
    expect(delivered.counterpartLastReadId, 'r1');
    final read = delivered.withReceipts(readId: 'r5', readAt: DateTime(2027));
    expect(read.counterpartLastReadId, 'r5');
    expect(read.counterpartLastDeliveredId, 'd9');
  });
}
