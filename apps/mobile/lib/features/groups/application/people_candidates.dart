import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/text/search_fold.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_book_sync.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// A person that can be put into a group.
class PickedPerson {
  const PickedPerson({
    required this.userId,
    required this.name,
    this.avatarUrl,
  });

  final String userId;
  final String name;
  final String? avatarUrl;
}

/// The real people behind my direct chats: not blocked, not an open message
/// request, with a known id and a visible name (an anonymous client has
/// neither). Pure, so it is unit-tested.
List<PickedPerson> peopleFromConversations(Iterable<Conversation> chats) => [
      for (final c in chats)
        if (c.isDirect &&
            !c.blocked &&
            c.request != MessageRequest.pending &&
            c.request != MessageRequest.declined &&
            c.counterpart.id != null &&
            (c.counterpart.displayName ?? '').trim().isNotEmpty)
          PickedPerson(
            userId: c.counterpart.id!,
            name: c.counterpart.displayName!.trim(),
            avatarUrl: c.counterpart.avatarUrl,
          ),
    ];

/// Merges several sources into one list: drops [myId] and [excludeIds],
/// dedupes by user id (the first source wins) and sorts by name.
List<PickedPerson> mergePeopleCandidates(
  Iterable<Iterable<PickedPerson>> sources, {
  String? myId,
  Set<String> excludeIds = const {},
  bool keepOrder = false,
}) {
  final byId = <String, PickedPerson>{};
  for (final source in sources) {
    for (final p in source) {
      if (p.userId == myId || excludeIds.contains(p.userId)) continue;
      byId.putIfAbsent(p.userId, () => p);
    }
  }
  final list = byId.values.toList();
  if (keepOrder) return list;
  return list
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
}

/// [people] without the ids in [excludeIds].
List<PickedPerson> withoutPeople(
  List<PickedPerson> people,
  Set<String> excludeIds,
) =>
    excludeIds.isEmpty
        ? people
        : [
            for (final p in people)
              if (!excludeIds.contains(p.userId)) p,
          ];

/// Owner 2026-11-16 (WhatsApp «Часто общаетесь» in «Новая группа»): the
/// people of my direct chats with the newest activity first, at most
/// [limit]. The chat list is already ordered by the last message, so the
/// people I write to most recently lead. Pure, so it is unit-tested.
List<PickedPerson> frequentPeopleFromConversations(
  Iterable<Conversation> chats, {
  String? myId,
  int limit = frequentPeopleMax,
}) {
  DateTime at(Conversation c) => c.lastMessageAt ?? c.updatedAt;
  final sorted = [
    for (final c in chats)
      if (c.lastMessage != null || c.lastMessageAt != null) c,
  ]..sort((a, b) => at(b).compareTo(at(a)));
  return mergePeopleCandidates(
    [peopleFromConversations(sorted)],
    myId: myId,
    keepOrder: true,
  ).take(limit).toList();
}

/// How many people «Часто общаетесь» shows (WhatsApp shows a handful).
const frequentPeopleMax = 5;

/// Owner 2026-11-16: the LawBid people of my phone book, from the copy of
/// the last contacts sync kept on the phone — no phone-book read, no
/// permission prompt and no request here (the Contacts screen syncs).
List<PickedPerson> peopleFromContacts(Iterable<ContactPerson> contacts) => [
      for (final c in contacts)
        if (c.displayName.trim().isNotEmpty)
          PickedPerson(
            userId: c.userId,
            name: c.displayName.trim(),
            avatarUrl: c.avatarUrl,
          ),
    ];

/// The people whose name contains [query] (any case); all when it is blank.
List<PickedPerson> filterPeople(List<PickedPerson> people, String query) {
  return [
    for (final p in people)
      if (textMatches(query, [p.name])) p,
  ];
}

/// How many extra pages of chats are read to find people (50 chats each is
/// plenty for a picker; the search stays local).
const _maxChatPages = 4;

/// The people I can put into a group, for the people picker.
///
/// Sources merged by [mergePeopleCandidates]:
///  * the counterparts of my direct chats (all loaded pages of
///    `conversationsProvider`, up to [_maxChatPages] more);
///  * the LawBid people of my phone book ([groupContactPeopleProvider], the
///    copy of the last contacts sync on the phone).
///
/// Me is already left out; the picker drops people already in the group
/// with [withoutPeople].
final groupPeopleCandidatesProvider =
    FutureProvider.autoDispose<List<PickedPerson>>((ref) async {
  // Keep the chats alive while pages load, without rebuilding on each one.
  ref.listen(conversationsProvider, (_, __) {});
  final myId = ref.read(currentUserControllerProvider).user?.id;
  var list = await ref.read(conversationsProvider.future);
  final notifier = ref.read(conversationsProvider.notifier);
  for (var i = 0; i < _maxChatPages && list.canLoadMore; i++) {
    await notifier.loadMore();
    if (!ref.mounted) return const [];
    list = ref.read(conversationsProvider).value ?? list;
  }
  final sources = <Iterable<PickedPerson>>[
    peopleFromConversations(list.items),
    // Owner 2026-11-16 (WhatsApp «Контакты»): my phone book's LawBid people.
    await ref.read(groupContactPeopleProvider.future),
  ];
  return mergePeopleCandidates(sources, myId: myId);
});

/// The LawBid people of my phone book for the picker ([peopleFromContacts]);
/// empty when contacts were never synced on this phone or the copy cannot
/// be read — the picker never waits on or fails because of it.
final groupContactPeopleProvider =
    FutureProvider.autoDispose<List<PickedPerson>>((ref) async {
  try {
    final saved = await ref.read(contactsBookSyncProvider).loadSaved();
    return peopleFromContacts(saved?.people ?? const []);
  } on Object {
    return const [];
  }
});

/// «Часто общаетесь» of the picker ([frequentPeopleFromConversations]),
/// from the chats already on the phone — no request.
final groupFrequentPeopleProvider =
    Provider.autoDispose<List<PickedPerson>>((ref) {
  // The picker's candidates keep the chats loaded; this only reads them
  // once they are there (it never starts the chats list by itself).
  ref.watch(groupPeopleCandidatesProvider);
  if (!ref.read(conversationsProvider.exists)) return const [];
  final chats = ref.watch(conversationsProvider).value?.items;
  if (chats == null) return const [];
  return frequentPeopleFromConversations(
    chats,
    myId: ref.read(currentUserControllerProvider).user?.id,
  );
});
