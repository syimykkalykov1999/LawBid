import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/message_groups.dart';
import 'package:lawbid/features/chat/presentation/chat_list_layout.dart';

/// Owner 2026-10-26 (smoothness): the message list's rows are worked out
/// once per change and give exactly what the old per-build code gave.
ChatMessage _m(
  int i, {
  required String sender,
  bool photo = false,
  DateTime? expiresAt,
  DateTime? at,
}) =>
    ChatMessage(
      id: 'm$i',
      conversationId: 'c1',
      kind: photo ? MessageKind.attachment : MessageKind.text,
      body: photo ? '' : 'text $i',
      senderId: sender,
      createdAt: at ?? DateTime(2026, 10, 1, 9).add(Duration(seconds: i * 20)),
      expiresAt: expiresAt,
      attachment: photo
          ? ChatAttachment(fileId: 'a$i', name: 'p$i.jpg', isImage: true)
          : null,
    );

/// The list's old per-build code, kept here as the reference.
typedef _Old = ({
  List<bool> seen,
  List<bool> delivered,
  List<bool> label,
  List<int> idx,
});

_Old _old(
  List<ChatMessage> items,
  String me,
  String? read,
  String? delivered,
) {
  final seenIndex = read == null ? -1 : items.indexWhere((m) => m.id == read);
  final newestOwnSeen = seenIndex < 0
      ? null
      : items.skip(seenIndex).where((m) => m.senderId == me).firstOrNull?.id;
  final entries = groupChatMessages(items);
  final seenIds = seenIndex < 0
      ? const <String>{}
      : items.skip(seenIndex).map((m) => m.id).toSet();
  final deliveredIndex =
      delivered == null ? -1 : items.indexWhere((m) => m.id == delivered);
  final deliveredIds = deliveredIndex < 0
      ? const <String>{}
      : items.skip(deliveredIndex).map((m) => m.id).toSet();
  return (
    seen: [for (final e in entries) seenIds.contains(e.newest.id)],
    delivered: [for (final e in entries) deliveredIds.contains(e.newest.id)],
    label: [
      for (final e in entries) e.messages.any((x) => x.id == newestOwnSeen),
    ],
    idx: [
      for (final m in items)
        entries.indexWhere((e) => e.messages.any((x) => x.id == m.id)),
    ],
  );
}

void main() {
  test('same rows, ticks and "Seen" label as the old per-build code', () {
    final rnd = Random(7);
    for (var round = 0; round < 200; round++) {
      final n = 1 + rnd.nextInt(40);
      final items = [
        for (var i = n - 1; i >= 0; i--)
          _m(
            i,
            sender: rnd.nextBool() ? 'me' : 'u2',
            photo: rnd.nextInt(3) == 0,
          ),
      ];
      final read = rnd.nextInt(4) == 0 ? null : items[rnd.nextInt(n)].id;
      final delivered = rnd.nextInt(4) == 0 ? null : items[rnd.nextInt(n)].id;
      final layout = ChatListLayout.of(
        items: items,
        me: 'me',
        lastReadId: read,
        lastDeliveredId: delivered,
      );
      final old = _old(items, 'me', read, delivered);
      final entries = layout.entries;
      expect(
        [for (var i = 0; i < entries.length; i++) layout.seen(i)],
        old.seen,
        reason: 'round $round seen',
      );
      expect(
        [for (var i = 0; i < entries.length; i++) layout.delivered(i)],
        old.delivered,
        reason: 'round $round delivered',
      );
      expect(
        [for (var i = 0; i < entries.length; i++) i == layout.seenLabelEntry],
        old.label,
        reason: 'round $round label',
      );
      expect(
        [for (final m in items) layout.entryOf(m.id)],
        old.idx,
        reason: 'round $round index',
      );
      expect(layout.entryOf('missing'), -1);
    }
  });

  test('sameAs: same list and receipts reuse the layout', () {
    final items = [_m(1, sender: 'me'), _m(0, sender: 'u2')];
    final a = ChatListLayout.of(
      items: items,
      me: 'me',
      lastReadId: 'm0',
      lastDeliveredId: null,
    );
    expect(
      a.sameAs(items: items, me: 'me', lastReadId: 'm0', lastDeliveredId: null),
      isTrue,
    );
    expect(
      a.sameAs(items: items, me: 'me', lastReadId: 'm1', lastDeliveredId: null),
      isFalse,
    );
    expect(
      a.sameAs(
        items: [...items],
        me: 'me',
        lastReadId: 'm0',
        lastDeliveredId: null,
      ),
      isFalse,
    );
  });

  group('ChatThreadState.all', () {
    test('the same list on every read while nothing changed', () {
      final s = ChatThreadState(
        messages: [_m(2, sender: 'u2'), _m(1, sender: 'me')],
        outbox: [_m(3, sender: 'me')],
      );
      final first = s.all;
      expect(identical(first, s.all), isTrue);
      expect(first.map((m) => m.id), ['m3', 'm2', 'm1']);
      // "typing" makes a new state with the same lists: still one list.
      expect(identical(first, s.copyWith(typing: true).all), isTrue);
      // A new message list: worked out again.
      final next = s.copyWith(messages: [_m(4, sender: 'u2'), ...s.messages]);
      expect(next.all.map((m) => m.id), ['m3', 'm4', 'm2', 'm1']);
      expect(() => first.add(_m(9, sender: 'me')), throwsUnsupportedError);
    });

    test('a disappearing message still vanishes on time', () {
      final now = DateTime.now();
      final s = ChatThreadState(
        messages: [
          _m(
            2,
            sender: 'u2',
            at: now,
            expiresAt: now.add(const Duration(milliseconds: 300)),
          ),
          _m(1, sender: 'me', at: now),
        ],
      );
      expect(s.all.map((m) => m.id), ['m2', 'm1']);
      return Future<void>.delayed(const Duration(milliseconds: 400), () {
        expect(s.all.map((m) => m.id), ['m1']);
      });
    });

    test('outbox and voice outbox sort newest first on top', () {
      final now = DateTime(2026, 10, 2);
      final s = ChatThreadState(
        messages: [_m(1, sender: 'u2', at: now)],
        outbox: [_m(2, sender: 'me', at: now.add(const Duration(minutes: 1)))],
        voiceOutbox: [
          _m(3, sender: 'me', at: now.add(const Duration(minutes: 2))),
        ],
      );
      expect(s.all.map((m) => m.id), ['m3', 'm2', 'm1']);
    });
  });
}
