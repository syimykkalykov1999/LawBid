import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/core/text/search_fold.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/people/people_suggest.dart';

/// Owner 2026-10-22 (WhatsApp «Add participant»): the people I may call in
/// from a running call — never strangers. Three groups, in this order:
///  1. my LawBid contacts (phone-book people on LawBid, once the contact
///     sync was allowed — nothing is asked from here);
///  2. the people of my 1:1 chats whose messages were accepted (a case chat
///     or a direct one; an open or declined request does not count), even
///     when we do not follow each other;
///  3. mutual follows (I follow them and they follow me).
/// A person in several groups is shown once, in the first one.
enum MyPeopleGroup { contacts, chats, mutual }

/// One person of [myPeopleProvider].
@immutable
class MyPerson {
  const MyPerson({
    required this.id,
    required this.group,
    this.name = '',
    this.username = '',
    this.avatarUrl,
    this.lastAt,
    this.role,
  });

  final String id;
  final MyPeopleGroup group;

  /// The name (the phone-book one for a contact); may be empty.
  final String name;

  /// Without «@»; may be empty.
  final String username;
  final String? avatarUrl;

  /// When the last message of our chat was (null for a mutual follow without
  /// a chat) — the «Chats» tab sorts by it.
  final DateTime? lastAt;

  /// `attorney` / `client` / `assistant` when known.
  final String? role;

  /// The name, or @username when there is none.
  String get title => name.isEmpty ? atHandle(username) : name;

  /// [query] (already normalised by [peopleSuggestQuery], lower case) is in
  /// the name or the @username.
  bool matches(String query) =>
      query.isEmpty ||
      name.toLowerCase().contains(query) ||
      username.toLowerCase().contains(query);

  @override
  bool operator ==(Object other) => other is MyPerson && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// One list from the three sources: me left out, a person kept in the first
/// group that has them, each group sorted by name; contacts, then chats,
/// then mutual follows. Pure, so it is unit-tested.
List<MyPerson> mergeMyPeople({
  Iterable<MyPerson> contacts = const [],
  Iterable<MyPerson> chats = const [],
  Iterable<MyPerson> mutual = const [],
  String? myId,
}) {
  final seen = <String>{if (myId != null) myId};
  final out = <MyPerson>[];
  for (final source in [contacts, chats, mutual]) {
    final group = [
      for (final p in source)
        if (p.id.isNotEmpty && seen.add(p.id)) p,
    ]..sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
    out.addAll(group);
  }
  return out;
}

/// [people] matching [raw] by name or @username, best match first — the
/// same rule as People and chat search ([rankByName], owner 2026-10-28:
/// every word by its start, any alphabet; a typo only when nothing matched
/// better); all of them when it is blank. Local — the list is short.
List<MyPerson> filterMyPeople(List<MyPerson> people, String raw) {
  final q = peopleSuggestQuery(raw).toLowerCase();
  if (q.isEmpty) return people;
  return rankByName(people, q, (p) => p.name, (p) => p.username);
}

/// The real people behind my accepted 1:1 chats.
List<MyPerson> myPeopleFromChats(Iterable<Conversation> chats) => [
      for (final c in chats)
        if (!c.blocked &&
            c.request != MessageRequest.pending &&
            c.request != MessageRequest.declined &&
            (c.counterpart.id ?? '').isNotEmpty &&
            ((c.counterpart.displayName ?? '').trim().isNotEmpty ||
                (c.counterpart.username ?? '').isNotEmpty))
          MyPerson(
            id: c.counterpart.id!,
            group: MyPeopleGroup.chats,
            name: (c.counterpart.displayName ?? '').trim(),
            username: c.counterpart.username ?? '',
            avatarUrl: c.counterpart.avatarUrl,
            lastAt: c.lastMessageAt ?? c.updatedAt,
            role: c.counterpart.isAttorney ? 'attorney' : null,
          ),
    ];

/// How many more pages of chats / follows are read (enough for a picker).
const _maxPages = 4;

Future<List<MyPerson>> _contacts(Ref ref) async {
  try {
    final book = await ref.read(phoneContactsProvider.future);
    if (book.needsConsent || book.denied) return const [];
    return [
      for (final c in book.onLawBid)
        MyPerson(
          id: c.userId,
          group: MyPeopleGroup.contacts,
          name: c.title.trim(),
          username: c.person.username ?? '',
          avatarUrl: c.person.avatarUrl,
        ),
    ];
  } on Object {
    return const [];
  }
}

Future<List<MyPerson>> _chats(Ref ref) async {
  try {
    // Keep the chats alive while pages load, without rebuilding on each one.
    final keep = ref.listen(conversationsProvider, (_, __) {});
    try {
      var list = await ref.read(conversationsProvider.future);
      final notifier = ref.read(conversationsProvider.notifier);
      for (var i = 0; i < _maxPages && list.canLoadMore; i++) {
        await notifier.loadMore();
        if (!ref.mounted) return const [];
        list = ref.read(conversationsProvider).value ?? list;
      }
      return myPeopleFromChats(list.items);
    } finally {
      keep.close();
    }
  } on Object {
    return const [];
  }
}

Future<List<MyPerson>> _mutual(Ref ref, String? myId) async {
  if (myId == null) return const [];
  final repo = ref.read(socialRepositoryProvider);
  Future<Map<String, SuggestedPerson>> all({required bool followers}) async {
    final out = <String, SuggestedPerson>{};
    String? cursor;
    for (var i = 0; i <= _maxPages; i++) {
      final page = followers
          ? await repo.followers(myId, cursor: cursor)
          : await repo.following(myId, cursor: cursor);
      for (final row in page.items) {
        out[row.id] = SuggestedPerson.fromRow(row);
      }
      cursor = page.nextCursor;
      if (cursor == null) break;
    }
    return out;
  }

  try {
    // A client has no followers list (only attorneys are followed): the
    // server says no and the group stays empty.
    final both = await Future.wait([
      all(followers: false),
      all(followers: true),
    ]);
    final following = both[0];
    final followers = both[1];
    return [
      for (final e in following.entries)
        if (followers.containsKey(e.key))
          MyPerson(
            id: e.key,
            group: MyPeopleGroup.mutual,
            name: e.value.name,
            username: e.value.username,
            avatarUrl: e.value.avatarUrl,
            role: e.value.isAttorney ? 'attorney' : null,
          ),
    ];
  } on Object {
    return const [];
  }
}

/// The people I may call in: see [MyPeopleGroup]. A source that fails is
/// left out, the others still show. Overridden in tests.
final myPeopleProvider = FutureProvider.autoDispose<List<MyPerson>>((
  ref,
) async {
  final myId = ref.read(currentUserIdProvider);
  final parts = await Future.wait([
    _contacts(ref),
    _chats(ref),
    _mutual(ref, myId),
  ]);
  return mergeMyPeople(
    contacts: parts[0],
    chats: parts[1],
    mutual: parts[2],
    myId: myId,
  );
});

/// Owner 2026-10-22: the «Chats» tab of the «+» screen — the people I talk
/// with: chats first, the most recent conversation on top, then the mutual
/// follows I have no chat with, by name. Contacts are not here (their own
/// tab), even when we also chat.
List<MyPerson> sortMyChatPeople(Iterable<MyPerson> people) {
  final list = people.toList()
    ..sort((a, b) {
      final x = a.lastAt;
      final y = b.lastAt;
      if (x != null && y != null) return y.compareTo(x);
      if (x != null) return -1;
      if (y != null) return 1;
      return a.title.toLowerCase().compareTo(b.title.toLowerCase());
    });
  return list;
}

final myChatPeopleProvider = FutureProvider.autoDispose<List<MyPerson>>((
  ref,
) async {
  final myId = ref.read(currentUserIdProvider);
  final parts = await Future.wait([_chats(ref), _mutual(ref, myId)]);
  return sortMyChatPeople(
    mergeMyPeople(chats: parts[0], mutual: parts[1], myId: myId),
  );
});
