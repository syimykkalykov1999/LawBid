import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
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
}) {
  final byId = <String, PickedPerson>{};
  for (final source in sources) {
    for (final p in source) {
      if (p.userId == myId || excludeIds.contains(p.userId)) continue;
      byId.putIfAbsent(p.userId, () => p);
    }
  }
  return byId.values.toList()
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

/// The people whose name contains [query] (any case); all when it is blank.
List<PickedPerson> filterPeople(List<PickedPerson> people, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return people;
  return [
    for (final p in people)
      if (p.name.toLowerCase().contains(q)) p,
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
///  * CONTACTS CONNECTION POINT: the phone-contacts source (branch
///    `claude/contacts-sync`) is to be merged HERE — add its
///    `List<PickedPerson>` to the `sources` list below. Nothing else in the
///    picker or in the create-group screen needs to change.
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
    // CONTACTS CONNECTION POINT: add the phone-contacts people here.
  ];
  return mergePeopleCandidates(sources, myId: myId);
});
