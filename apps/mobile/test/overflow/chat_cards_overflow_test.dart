import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/data/chat_extras_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_cards.dart';
import 'package:lawbid/features/chat/presentation/chat_message_menu.dart';
import 'package:lawbid/features/chat/presentation/saved_chats_view.dart';
import 'package:lawbid/features/translation/data/device_translator.dart';
import 'package:lawbid/features/translation/presentation/translate_block.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

class _Engine implements TranslationEngine {
  @override
  Future<String?> detect(String text) async => 'en';
  @override
  Future<bool> hasModel(String code) async => true;
  @override
  Future<bool> onWifi() async => true;

  @override
  Future<bool> downloadModel(String code) async => true;
  @override
  Future<String> translate(String text, String from, String to) async => text;
}

const _card = ContactCard(
  userId: 'u1',
  username: 'danielkim_immigration',
  displayName: 'Daniel Kim-Montgomery',
  verified: true,
  firmNames: ['Kim, Montgomery & Partners'],
  practiceKeys: [
    'practice.technology_privacy_and_cyber_law',
    'practice.immigration',
  ],
  licensedStates: ['NY', 'CA'],
);

ChatMessage _msg(
  String id,
  MessageKind kind,
  String body, {
  ContactCard? contact,
}) =>
    ChatMessage(
      id: id,
      conversationId: 'c1',
      senderId: 'u2',
      kind: kind,
      body: body,
      createdAt: DateTime(2026, 10, 20),
      contact: contact,
    );

Conversation get _chat => Conversation(
      id: 'c1',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(
        isAttorney: true,
        verified: true,
        id: 'u2',
        displayName: 'Alexandra Konstantinopoulou-Richardson',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
    );

class _SavedRepo implements ChatExtrasRepository {
  @override
  Future<CursorPage<SavedChatEntry>> saved({
    SavedChatTab tab = SavedChatTab.all,
    String? query,
    String? cursor,
  }) async =>
      CursorPage(
        items: [
          for (final (i, m) in [
            _msg('m1', MessageKind.text,
                'https://lawbid.dev/lawyer/${'x' * 60}',
            ),
            _msg(
              'm2',
              MessageKind.text,
              'Please send the documents for the hearing before Friday',
            ),
            _msg('m3', MessageKind.contact, '', contact: _card),
            _msg(
              'm4',
              MessageKind.place,
              '1234 Very Long Boulevard Name, Suite 5600, New York, NY 10001',
            ),
          ].indexed)
            SavedChatEntry(
              message: m,
              chat: _chat,
              mine: i.isOdd,
              savedAt: DateTime(2026, 10, 20),
            ),
        ],
      );

  @override
  Future<Set<String>> savedIds() async => {'m1'};

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

/// Owner rule: every new screen in the longest translation of every key,
/// Nepali, German, Arabic, Marathi and Russian, at 360 dp, text x1.0 and
/// x1.1 (the largest the app allows). Any RenderFlex overflow fails.
void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('no overflow at 360 dp ($name, text x$scale)', () {
        Future<void> pump(WidgetTester tester, Widget home) async {
          useNarrowPhone(tester);
          final overrides = <Override>[
            ...uxOverrides(
              translator: t,
              extra: [
                sharedPreferencesProvider.overrideWithValue(prefs),
                chatExtrasRepositoryProvider.overrideWithValue(_SavedRepo()),
                deviceTranslatorProvider.overrideWithValue(
                  DeviceTranslator(engine: _Engine(), supported: true),
                ),
              ],
            ),
          ];
          await tester.pumpWidget(
            ProviderScope(
              overrides: overrides,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: AppTheme.light(),
                builder: (context, child) => Directionality(
                  textDirection: dir,
                  child: MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      textScaler: TextScaler.linear(scale),
                      disableAnimations: true,
                    ),
                    child: child!,
                  ),
                ),
                home: home,
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
        }

        Widget bubble({required bool mine, required Widget child}) => Align(
              alignment: AlignmentDirectional.centerStart,
              child: Container(
                constraints: const BoxConstraints(maxWidth: 360 * 0.78),
                padding: const EdgeInsets.all(AppSpacing.md),
                color: mine ? const Color(0xFFDCF8C6) : const Color(0xFFFFFFFF),
                child: child,
              ),
            );

        testWidgets('contact and place cards in a bubble', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: ListView(
                children: [
                  bubble(
                      mine: true,
                      child: const ContactCardBody(card: _card, mine: true),
                  ),
                  bubble(
                    mine: false,
                    child: const ContactCardBody(card: _card, mine: false),
                  ),
                  bubble(
                    mine: false,
                    child: const PlaceCardBody(
                      address:
                          '1234 Very Long Boulevard Name, Suite 5600, New York',
                      mine: false,
                    ),
                  ),
                ],
              ),
            ),
          );
          expect(tester.takeException(), isNull);
        });

        testWidgets('Saved list', (tester) async {
          await pump(tester, const Scaffold(body: SavedChatsView()));
          expect(tester.takeException(), isNull);
          expect(find.byType(ContactCardBody), findsOneWidget);
          expect(find.byType(PlaceCardBody), findsOneWidget);
        });

        testWidgets('Translate line under a text', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: TranslateBlock(
                  text: 'Please send the documents before Friday',
                  builder: (context, translation) =>
                      Text(translation ?? 'Please send the documents'),
                ),
              ),
            ),
          );
          await tester.tap(find.text(t.t('chat.translate')));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          expect(tester.takeException(), isNull);
        });

        testWidgets('long-press menu of a message', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: Center(
                child: MessageMenuTarget(
                  messages: [_msg('m1', MessageKind.text, 'Hello there')],
                  child: const Text('Hello there'),
                ),
              ),
            ),
          );
          await tester.longPress(find.text('Hello there'));
          await tester.pump(const Duration(milliseconds: 500));
          expect(tester.takeException(), isNull);
          expect(find.text(t.t('share.copy')), findsOneWidget);
        });

        for (final place in [false, true]) {
          testWidgets(place ? 'place sheet' : 'contact picker', (tester) async {
            await pump(
              tester,
              Scaffold(
                body: Consumer(
                  builder: (context, ref, _) => TextButton(
                    onPressed: () => unawaited(
                      place
                          ? askPlaceAddress(context, ref)
                          : pickContactToShare(context, ref),
                    ),
                    child: const Text('open'),
                  ),
                ),
              ),
            );
            await tester.tap(find.text('open'));
            await tester.pump(const Duration(milliseconds: 600));
            expect(tester.takeException(), isNull);
          });
        }
      });
    }
  }
}
