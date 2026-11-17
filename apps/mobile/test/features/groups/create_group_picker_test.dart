import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/people_candidates.dart';
import 'package:lawbid/features/groups/presentation/widgets/people_picker.dart';

import '../../helpers/ux_harness.dart';

Conversation _chat(String userId, String name, {required int hoursAgo}) =>
    Conversation(
      id: 'c-$userId',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: false,
        verified: false,
        id: userId,
        displayName: name,
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      isDirect: true,
      lastMessageAt: DateTime(2026, 11, 16, 12).subtract(
        Duration(hours: hoursAgo),
      ),
    );

/// Owner 2026-11-16 (chat-groups plan, steps 2/3, WhatsApp «Новая группа»):
/// the members step has the search on top, «Часто общаетесь» first, then
/// everyone else (my chats and my phone book's LawBid people) under
/// «Контакты»; the chosen people are chips on top; a round «→» goes on.
void main() {
  test('«Часто общаетесь»: the newest chats first, at most five, no me', () {
    final people = frequentPeopleFromConversations(
      [
        for (var i = 0; i < 8; i++) _chat('u$i', 'Person $i', hoursAgo: 8 - i),
        _chat('me', 'Me', hoursAgo: 0),
      ],
      myId: 'me',
    );
    expect(people.map((p) => p.userId), ['u7', 'u6', 'u5', 'u4', 'u3']);
  });

  test('a chat without any message is not «frequent»', () {
    final quiet = Conversation(
      id: 'q',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(
        isAttorney: false,
        verified: false,
        id: 'q',
        displayName: 'Quiet',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      isDirect: true,
    );
    expect(frequentPeopleFromConversations([quiet]), isEmpty);
  });

  test('the phone book LawBid people become picker people', () {
    final people = peopleFromContacts(const [
      (userId: 'k1', displayName: ' Kim ', avatarUrl: null),
      (userId: 'k2', displayName: ' ', avatarUrl: null),
    ]);
    expect(people.map((p) => (p.userId, p.name)), [('k1', 'Kim')]);
  });

  testWidgets('sections: «Часто общаетесь» first, the rest once below',
      (tester) async {
    final picked = <PickedPerson>[];
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          groupPeopleCandidatesProvider.overrideWith(
            (ref) async => const [
              PickedPerson(userId: 'a', name: 'Anna'),
              PickedPerson(userId: 'b', name: 'Boris'),
              PickedPerson(userId: 'k', name: 'Kim From Contacts'),
            ],
          ),
          groupFrequentPeopleProvider.overrideWith(
            (ref) => const [PickedPerson(userId: 'b', name: 'Boris')],
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => PeopleSelector(
                selected: picked,
                onToggle: (p) => setState(() => picked.add(p)),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final frequent = find.byKey(
      const ValueKey('people-section-group.picker.frequent'),
    );
    final contacts = find.byKey(
      const ValueKey('people-section-phoneContacts.title'),
    );
    expect(frequent, findsOneWidget);
    expect(contacts, findsOneWidget);
    expect(find.text('Frequently contacted'), findsOneWidget);
    // Boris is listed once, under «Часто общаетесь».
    expect(find.byKey(const ValueKey('person-b')), findsOneWidget);
    final y = tester.getCenter(find.byKey(const ValueKey('person-b'))).dy;
    expect(y, lessThan(tester.getCenter(contacts).dy));
    expect(
      tester.getCenter(find.byKey(const ValueKey('person-a'))).dy,
      greaterThan(tester.getCenter(contacts).dy),
    );
    expect(find.byKey(const ValueKey('person-k')), findsOneWidget);
    // A tick puts the person as a chip on top.
    await tester.tap(find.byKey(const ValueKey('person-b')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chip-b')), findsOneWidget);
    // A search shows the plain filtered list, no sections.
    await tester.enterText(find.byKey(const ValueKey('people-search')), 'K');
    await tester.pump();
    expect(frequent, findsNothing);
    expect(find.byKey(const ValueKey('person-k')), findsOneWidget);
    expect(find.byKey(const ValueKey('person-a')), findsNothing);
  });
}
