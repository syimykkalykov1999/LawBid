// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-20: edit / delete / react / pin / reply / unread divider.
class _Chat implements ChatRepository {
  _Chat(this.stored, {this.unread = 0});

  List<ChatMessage> stored;
  final int unread;
  final sent = <({String body, String? replyToId, bool forwarded})>[];
  final deleted = <String>[];
  ChatPins pinsInfo = const ChatPins(
    items: [],
    editWindowMin: 15,
    deleteForAllHours: 48,
    maxPins: 3,
  );

  @override
  Future<Conversation> conversation(String id) async => Conversation(
        id: id,
        caseId: 'case-1',
        caseTitle: 'Case',
        status: ConversationStatus.active,
        contactsUnlocked: true,
        counterpart: const Counterpart(isAttorney: true, verified: true),
        unreadCount: unread,
        updatedAt: DateTime(2026),
      );

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async =>
      CursorPage(items: stored);

  @override
  Future<ChatPins> pins(String id) async => pinsInfo;

  @override
  Future<ChatMessage> editMessage(
          String id,
          String messageId,
          String body,
        ) async =>
      stored.firstWhere((m) => m.id == messageId).copyWith(
            body: body,
            editedAt: DateTime(2026, 10, 20, 12),
          );

  @override
  Future<void> deleteMessage(
    String id,
    String messageId, {
    required bool all,
  }) async =>
      deleted.add('$messageId:${all ? 'all' : 'me'}');

  @override
  Future<ChatMessage> react(String id, String messageId, String? emoji) async =>
      stored.firstWhere((m) => m.id == messageId).copyWith(
            reactions: emoji == null
                ? const []
                : [MessageReaction(emoji: emoji, count: 1, mine: true)],
          );

  @override
  Future<ChatMessage> setPinned(
    String id,
    String messageId, {
    required bool pinned,
  }) async =>
      stored.firstWhere((m) => m.id == messageId).copyWith(pinned: pinned);

  @override
  Future<ChatMessage> send(
    String id,
    String clientMessageId,
    String body, {
    String? replyToId,
    bool forwarded = false,
  }) async {
    sent.add((body: body, replyToId: replyToId, forwarded: forwarded));
    return ChatMessage(
      id: 'srv-${sent.length}',
      conversationId: id,
      senderId: 'me',
      kind: MessageKind.text,
      body: body,
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

ChatMessage _msg(
  String id, {
  String sender = 'me',
  Duration age = Duration.zero,
  String body = 'hello',
}) =>
    ChatMessage(
      id: id,
      conversationId: 'c1',
      senderId: sender,
      kind: MessageKind.text,
      body: body,
      createdAt: DateTime.now().subtract(age),
    );

({ProviderContainer c, StreamController<RealtimeEvent> events}) _setup(
  _Chat chat,
) {
  final db = SocialLocalDatabase(NativeDatabase.memory());
  final events = StreamController<RealtimeEvent>.broadcast();
  final c = ProviderContainer(
    overrides: [
      chatRepositoryProvider.overrideWithValue(chat),
      socialLocalDatabaseProvider.overrideWithValue(db),
      currentUserIdProvider.overrideWithValue('me'),
      realtimeClientProvider.overrideWithValue(null),
      realtimeEventsProvider.overrideWithValue(events.stream),
      networkInterfaceMonitorProvider.overrideWithValue(FakeNetworkMonitor()),
      reachabilityProbeProvider.overrideWithValue(FakeProbe().call),
    ],
  );
  addTearDown(() async {
    await events.close();
    c.dispose();
    await db.close();
  });
  return (c: c, events: events);
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 60));

void main() {
  test('edit is allowed only for my text inside the server window', () async {
    final chat = _Chat([
      _msg('fresh', age: const Duration(minutes: 2)),
      _msg('old', age: const Duration(minutes: 20)),
      _msg('theirs', sender: 'them', age: const Duration(minutes: 1)),
    ]);
    final s = _setup(chat);
    final sub = s.c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final n = s.c.read(chatThreadProvider('c1').notifier);
    final all = s.c.read(chatThreadProvider('c1')).messages;
    expect(n.canEdit(all.firstWhere((m) => m.id == 'fresh')), isTrue);
    expect(n.canEdit(all.firstWhere((m) => m.id == 'old')), isFalse);
    expect(n.canEdit(all.firstWhere((m) => m.id == 'theirs')), isFalse);

    await n.edit(all.firstWhere((m) => m.id == 'fresh'), ' changed ');
    final fresh = s.c
        .read(chatThreadProvider('c1'))
        .messages
        .firstWhere((m) => m.id == 'fresh');
    expect(fresh.body, 'changed');
    expect(fresh.editedAt, isNotNull);
  });

  test('delete for me removes it, for everyone leaves a tombstone', () async {
    final chat = _Chat([_msg('a'), _msg('b', age: const Duration(minutes: 1))]);
    final s = _setup(chat);
    final sub = s.c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final n = s.c.read(chatThreadProvider('c1').notifier);
    final msgs = s.c.read(chatThreadProvider('c1')).messages;
    await n.delete(msgs.firstWhere((m) => m.id == 'a'), all: false);
    await n.delete(msgs.firstWhere((m) => m.id == 'b'), all: true);
    expect(chat.deleted, ['a:me', 'b:all']);
    final left = s.c.read(chatThreadProvider('c1')).messages;
    expect(left.map((m) => m.id), ['b']);
    expect(left.single.revoked, isTrue);
    expect(left.single.body, isEmpty);
  });

  test('reactions, pins and the server rules reach the state', () async {
    final chat = _Chat([_msg('a')])
      ..pinsInfo = const ChatPins(
        items: [],
        editWindowMin: 30,
        deleteForAllHours: 24,
        maxPins: 5,
      );
    final s = _setup(chat);
    final sub = s.c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    var st = s.c.read(chatThreadProvider('c1'));
    expect(st.editWindowMin, 30);
    expect(st.deleteForAllHours, 24);
    expect(st.maxPins, 5);
    final n = s.c.read(chatThreadProvider('c1').notifier);
    await n.react(st.messages.single, '❤️');
    st = s.c.read(chatThreadProvider('c1'));
    expect(st.messages.single.reactions.single.emoji, '❤️');
    await n.setPinned(st.messages.single, pinned: true);
    st = s.c.read(chatThreadProvider('c1'));
    expect(st.pins.single.id, 'a');
    expect(st.messages.single.pinned, isTrue);
    await n.setPinned(st.messages.single, pinned: false);
    expect(s.c.read(chatThreadProvider('c1')).pins, isEmpty);
  });

  test('message:updated from the other side replaces the message', () async {
    final chat = _Chat([_msg('a', sender: 'them')]);
    final s = _setup(chat);
    final sub = s.c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final json = <String, dynamic>{
      'id': 'a',
      'conversationId': 'c1',
      'senderId': 'them',
      'type': 'text',
      'body': 'fixed',
      'contactMasked': false,
      'createdAt': '2026-10-20T10:00:00.000Z',
      'editedAt': '2026-10-20T10:05:00.000Z',
      'revoked': false,
      'forwarded': false,
      'pinned': true,
      'reactions': [
        {'emoji': '👍', 'count': 2, 'mine': false},
      ],
      'replyTo': {
        'id': 'x',
        'type': 'text',
        'snippet': 'quoted',
        'revoked': false,
      },
    };
    s.events.add(RealtimeEvent('message:updated', {'message': json}));
    await _settle();
    final st = s.c.read(chatThreadProvider('c1'));
    final m = st.messages.single;
    expect(m.body, 'fixed');
    expect(m.editedAt, isNotNull);
    expect(m.reactions.single.count, 2);
    expect(m.replyTo?.snippet, 'quoted');
    expect(st.pins.single.id, 'a');

    // "Deleted for me" on another device of mine drops it here too.
    s.events.add(
      const RealtimeEvent('message:updated', {
        'hiddenForMe': true,
        'messageId': 'a',
        'conversationId': 'c1',
      }),
    );
    await _settle();
    final after = s.c.read(chatThreadProvider('c1'));
    expect(after.messages, isEmpty);
    expect(after.pins, isEmpty);
  });

  test('a reply goes out with its quoted id; a forward is labelled', () async {
    final chat = _Chat([_msg('q', sender: 'them')]);
    final s = _setup(chat);
    final sub = s.c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    await s.c
        .read(chatThreadProvider('c1').notifier)
        .send('re', replyToId: 'q');
    await _settle();
    await s.c.read(outboxSenderProvider).drain();
    await _settle();
    expect(chat.sent.single.replyToId, 'q');
    expect(chat.sent.single.forwarded, isFalse);

    final owner = s.c.read(currentUserIdProvider)!;
    await s.c.read(socialLocalDatabaseProvider).enqueue(
          clientMessageId: newClientMessageId(),
          ownerId: owner,
          conversationId: 'c1',
          body: 'passed on',
          forwarded: true,
        );
    await s.c.read(outboxSenderProvider).drain();
    await _settle();
    expect(chat.sent.last.forwarded, isTrue);
  });

  test('the unread divider sits above the oldest unread message', () async {
    final chat = _Chat(
      [
        _msg('new2', sender: 'them'),
        _msg('mine', age: const Duration(minutes: 1)),
        _msg('new1', sender: 'them', age: const Duration(minutes: 2)),
        _msg('read', sender: 'them', age: const Duration(minutes: 3)),
      ],
      unread: 2,
    );
    final s = _setup(chat);
    final sub = s.c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final st = s.c.read(chatThreadProvider('c1'));
    expect(st.unreadFromId, 'new1');
    expect(st.unreadCount, 2);
  });

  test('MessageDto maps the action fields', () {
    final m = ChatMappers.message(
      api.MessageDto.fromJson(<String, dynamic>{
        'id': 'a',
        'conversationId': 'c1',
        'type': 'text',
        'body': '',
        'contactMasked': false,
        'createdAt': '2026-10-20T10:00:00.000Z',
        'revoked': true,
        'forwarded': true,
        'pinned': false,
        'reactions': <dynamic>[],
      }),
    );
    expect(m.revoked, isTrue);
    expect(m.forwarded, isTrue);
    expect(m.replyTo, isNull);
    expect(m.reactions, isEmpty);
  });
}
