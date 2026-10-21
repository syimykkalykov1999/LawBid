import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/presentation/chat_files_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_files_screen.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../features/groups/fake_group_repository.dart';
import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

api.GroupMessageDto _file(String id, String name, String mime) => message(
      id,
      body: '',
      type: api.GroupMessageDtoType.attachment,
      attachment: api.ChatAttachmentDto(
        fileId: 'f-$id',
        name: name,
        isImage: mime.startsWith('image/'),
        mime: mime,
        sizeBytes: 123456789,
      ),
    );

/// Owner 2026-10-21 (Telegram «shared media»): the group's four tabs on a
/// 360 dp phone in the longest translation of every key, the same
/// right-to-left, Nepali, Arabic and Russian — at text scale 1 and 1.1,
/// with very long file names and links. Any overflow fails.
void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  const longName =
      'Agreement_between_the_parties_final_version_signed_2026_10_21.pdf';

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      for (final tab in ChatFilesTab.values) {
        testWidgets('group files, $tab: no overflow ($name, text x$scale)',
            (tester) async {
          useNarrowPhone(tester);
          final repo = FakeGroupRepository()
            ..sharedPage = 20
            ..sharedItems.addAll({
              api.GroupSharedKind.media: [
                for (var i = 0; i < 7; i++)
                  _file('p$i', 'p$i.jpg', 'image/jpeg'),
              ],
              api.GroupSharedKind.files: [
                _file('d0', longName, 'application/pdf'),
                _file('d1', 'x.docx', 'application/msword'),
              ],
              api.GroupSharedKind.links: [
                message(
                  'l0',
                  body: 'https://very-long-subdomain.example-law-firm.com/'
                      'practice/areas/immigration/asylum/2026?utm=1 and more',
                ),
              ],
              api.GroupSharedKind.voice: [
                _file('v0', longName.replaceAll('.pdf', '.ogg'), 'audio/ogg'),
              ],
            });
          final overrides = <Override>[
            ...uxOverrides(
              translator: t,
              extra: [groupRepositoryProvider.overrideWithValue(repo)],
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
                home: GroupFilesScreen(groupId: 'g1', initialTab: tab),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
