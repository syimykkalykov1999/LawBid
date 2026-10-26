import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-20: the Contacts screen fits a 360 dp phone
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

/// The phone book already read, the server's answer not here yet.
class _LiveBook extends PhoneContactsLive {
  @override
  PhoneContacts? build() => _data();
}

void main() {
  late SharedPreferences prefs;
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
  };
  final themes = {'light': AppTheme.light(), 'dark': AppTheme.dark()};
  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    for (final MapEntry(key: themeName, value: theme) in themes.entries) {
      testWidgets(
        'screen at 360 dp ($name, $themeName)',
        (tester) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            uxApp(
              Directionality(
                textDirection: dir,
                child: const ContactsScreen(initialContacts: true),
              ),
              theme: theme,
              size: narrowPhone,
              textScale: 1.1,
              disableAnimations: true,
              overrides: uxOverrides(
                translator: t,
                extra: [
                  sharedPreferencesProvider.overrideWithValue(prefs),
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

  // Owner 2026-10-22: Chats | Contacts | Calls swipe like every tab row.
  testWidgets('a swipe turns Contacts → Calls and back', (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const ContactsScreen(initialContacts: true),
        theme: AppTheme.light(),
        size: narrowPhone,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            phoneContactsProvider.overrideWith((_) async => _data()),
          ],
        ),
      ),
    );
    await tester.pump();
    final pages = tester.widget<PageView>(find.byType(PageView));
    final start = pages.controller!.page!;
    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(pages.controller!.page, start + 1);
    await tester.drag(find.byType(PageView), const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(pages.controller!.page, start);
  });

  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    testWidgets('the "new on LawBid" switch fits at 360 dp ($name)',
        (tester) async {
      useNarrowPhone(tester);
      await tester.pumpWidget(
        uxApp(
          Directionality(
            textDirection: dir,
            child: const ContactsScreen(initialContacts: true),
          ),
          theme: AppTheme.dark(),
          size: narrowPhone,
          textScale: 1.1,
          disableAnimations: true,
          overrides: uxOverrides(
            translator: t,
            extra: [
              sharedPreferencesProvider.overrideWithValue(prefs),
              phoneContactsProvider.overrideWith((_) async => _data()),
            ],
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      await tester.scrollUntilVisible(
        find.byType(SwitchListTile).last,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(tester.takeException(), isNull);
      expect(find.byType(SwitchListTile), findsWidgets);
    });
  }

  testWidgets('denied shows the allow button', (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const ContactsScreen(initialContacts: true),
        theme: AppTheme.dark(),
        size: narrowPhone,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            phoneContactsProvider
                .overrideWith((_) async => const PhoneContacts(denied: true)),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Open settings'), findsOneWidget);
  });

  testWidgets('sync off: asks before anything is read', (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const ContactsScreen(initialContacts: true),
        theme: AppTheme.light(),
        size: narrowPhone,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            phoneContactsProvider.overrideWith(
              (_) async => const PhoneContacts(needsConsent: true),
            ),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Find people from your contacts?'), findsOneWidget);
  });

  testWidgets(
      'owner 2026-10-22: the phone book shows while the server is asked, '
      'not a spinner', (tester) async {
    useNarrowPhone(tester);
    final never = Completer<PhoneContacts>();
    await tester.pumpWidget(
      uxApp(
        // The «Contacts» tab (the screen opens on «Chats» since #237).
        const ContactsScreen(initialContacts: true),
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            phoneContactsProvider.overrideWith((_) => never.future),
            phoneContactsLiveProvider.overrideWith(_LiveBook.new),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Bob'), findsWidgets);
    expect(find.text(_long), findsWidgets);
  });

  testWidgets('a failed match request still lists the phone book',
      (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        // The «Contacts» tab (the screen opens on «Chats» since #237).
        const ContactsScreen(initialContacts: true),
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            phoneContactsProvider.overrideWith(
              (_) async => const PhoneContacts(
                invite: [
                  InvitableContact(name: 'Carol', number: '+14155550001'),
                ],
                matchFailed: true,
              ),
            ),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Carol'), findsOneWidget);
    expect(find.text('Something went wrong'), findsNothing);
  });
}
