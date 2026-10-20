import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_picker.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_screen.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-20: the Contacts screen and the picker fit a 360 dp phone
/// in the longest language, right-to-left, Nepali and Arabic, in the light
/// and dark themes, and show both sections.
const _long = 'Maximilian-Alexander von Hohenzollern-Sigmaringen der Dritte';

PhoneContacts _data() => const PhoneContacts(
      onLawBid: [
        LawBidContact(
          person: ContactPerson(
            hash: 'h1',
            userId: 'u1',
            displayName: 'Ann Lee',
            username: 'annlee',
            role: 'attorney',
          ),
          phoneName: _long,
        ),
        LawBidContact(
          person: ContactPerson(
            hash: 'h2',
            userId: 'u2',
            displayName: 'Bob',
          ),
          phoneName: 'Bob',
        ),
      ],
      invite: [InvitableContact(name: _long, number: '+14155550000')],
    );

void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
  };
  final themes = {'light': AppTheme.light(), 'dark': AppTheme.dark()};
  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    for (final MapEntry(key: themeName, value: theme) in themes.entries) {
      for (final picker in [false, true]) {
        testWidgets(
          '${picker ? 'picker' : 'screen'} at 360 dp ($name, $themeName)',
          (tester) async {
            useNarrowPhone(tester);
            await tester.pumpWidget(
              uxApp(
                Directionality(
                  textDirection: dir,
                  child: picker
                      ? const Scaffold(body: ContactPickerSheet())
                      : const ContactsScreen(),
                ),
                theme: theme,
                size: narrowPhone,
                textScale: 1.1,
                disableAnimations: true,
                overrides: uxOverrides(
                  translator: t,
                  extra: [
                    phoneContactsProvider.overrideWith((_) async => _data()),
                  ],
                ),
              ),
            );
            await tester.pump();
            await tester.pump();
            expect(tester.takeException(), isNull);
            expect(find.text('Bob'), findsWidgets);
          },
        );
      }
    }
  }

  testWidgets('denied shows the allow button', (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const ContactsScreen(),
        theme: AppTheme.dark(),
        size: narrowPhone,
        overrides: uxOverrides(
          extra: [
            phoneContactsProvider
                .overrideWith((_) async => const PhoneContacts(denied: true)),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Allow access'), findsOneWidget);
  });
}
