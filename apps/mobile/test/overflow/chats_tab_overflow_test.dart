import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_screen.dart';
import 'package:lawbid/shared/people/my_people.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-22: the «Chats» tab (first of «Chats · Contacts · Calls»)
/// fits a 360 dp phone with long names in ru / ne / ar / de / mr, the
/// longest language and right-to-left, in every theme.
const _long = 'Maximilian-Alexander von Hohenzollern-Sigmaringen der Dritte';

final _people = [
  MyPerson(
    id: 'a',
    group: MyPeopleGroup.chats,
    name: _long,
    username: 'a_very_long_username_that_keeps_going_and_going',
    lastAt: DateTime(2026, 10),
    role: 'attorney',
  ),
  const MyPerson(id: 'b', group: MyPeopleGroup.mutual, name: 'Bob'),
];

void main() {
  late SharedPreferences prefs;
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });
  final locales = <String, (Translator, TextDirection)>{
    'ru': (const StaticTranslatorRu(), TextDirection.ltr),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
  };
  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    for (final id in AppThemeId.values) {
      testWidgets('chats tab at 360 dp ($name, ${id.name})', (tester) async {
        useNarrowPhone(tester);
        await tester.pumpWidget(
          uxApp(
            Directionality(textDirection: dir, child: const ContactsScreen()),
            theme: AppTheme.of(id),
            size: narrowPhone,
            textScale: 1.1,
            disableAnimations: true,
            overrides: uxOverrides(
              translator: t,
              extra: [
                sharedPreferencesProvider.overrideWithValue(prefs),
                phoneContactsProvider
                    .overrideWith((_) async => const PhoneContacts()),
                myChatPeopleProvider.overrideWith((_) async => _people),
              ],
            ),
          ),
        );
        await tester.pump();
        await tester.pump();
        expect(tester.takeException(), isNull);
        expect(find.text('Bob'), findsOneWidget);
      });
    }
  }
}
