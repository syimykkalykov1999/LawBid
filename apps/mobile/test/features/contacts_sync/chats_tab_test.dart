import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/presentation/chats_tab.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_actions.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_screen.dart';
import 'package:lawbid/shared/people/my_people.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22: the screen of the chats «+» has three tabs, «Chats» ·
/// «Contacts» · «Calls»; it opens on «Chats» — my people (chats, most recent
/// first, then mutual follows) with the same buttons as a contact.
final _people = [
  const MyPerson(
    id: 'm1',
    group: MyPeopleGroup.mutual,
    name: 'Mira Mutual',
    username: 'mira',
  ),
  MyPerson(
    id: 'a',
    group: MyPeopleGroup.chats,
    name: 'Old Chat',
    username: 'oldie',
    lastAt: DateTime(2026),
    role: 'attorney',
  ),
  MyPerson(
    id: 'b',
    group: MyPeopleGroup.chats,
    name: 'New Chat',
    username: 'fresh',
    lastAt: DateTime(2026, 10),
  ),
];

void main() {
  late SharedPreferences prefs;
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  Future<void> open(WidgetTester tester, {bool contacts = false}) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        ContactsScreen(initialContacts: contacts),
        theme: AppTheme.dark(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            phoneContactsProvider
                .overrideWith((_) async => const PhoneContacts()),
            myChatPeopleProvider
                .overrideWith((_) async => sortMyChatPeople(_people)),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  test('sortMyChatPeople: latest chat first, then mutual follows', () {
    expect(
      sortMyChatPeople(_people).map((p) => p.id),
      ['b', 'a', 'm1'],
    );
  });

  testWidgets('three tabs in order; opens on Chats', (tester) async {
    await open(tester);
    final seg = find.byKey(const ValueKey('contacts-calls-segment'));
    final labels = [
      for (final t in tester.widgetList<Text>(
        find.descendant(of: seg, matching: find.byType(Text)),
      ))
        t.data,
    ];
    expect(labels, ['Chats', 'Contacts', 'Calls']);
    expect(find.byType(ChatsTab), findsOneWidget);
    expect(find.text('New Chat'), findsOneWidget);
  });

  testWidgets('rows are the people, newest conversation first', (tester) async {
    await open(tester);
    final ys = [
      for (final n in ['New Chat', 'Old Chat', 'Mira Mutual'])
        tester.getTopLeft(find.text(n)).dy,
    ];
    expect(ys, [...ys]..sort());
  });

  testWidgets('each row has chat / call buttons like a contact',
      (tester) async {
    await open(tester);
    expect(find.byType(ContactActions), findsNWidgets(3));
    expect(find.bySemanticsLabel('Message'), findsNWidgets(3));
    expect(find.bySemanticsLabel('Call'), findsNWidgets(3));
  });

  testWidgets('search filters by name and @username', (tester) async {
    await open(tester);
    await tester.enterText(find.byType(TextField), '@fresh');
    await tester.pump();
    expect(find.text('New Chat'), findsOneWidget);
    expect(find.text('Old Chat'), findsNothing);
    await tester.enterText(find.byType(TextField), 'mira');
    await tester.pump();
    expect(find.text('Mira Mutual'), findsOneWidget);
    expect(find.text('New Chat'), findsNothing);
  });

  testWidgets('the Contacts tab can be the first', (tester) async {
    await open(tester, contacts: true);
    expect(find.byType(ChatsTab), findsNothing);
  });
}
