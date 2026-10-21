import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/presentation/channels_screen.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../features/channels/channels_fakes.dart';
import '../features/groups/fake_group_repository.dart';
import '../helpers/long_locale.dart';

/// Owner 2026-10-21 (п.19, п.22): the selection mode of the Channels screen
/// («Selected: N», «All», «×», the bottom bar) on a 360 dp phone in every
/// theme, ru / ne / ar, text ×1 and ×1.1 — for groups and for channels.
void main() {
  setUpAll(initializeDateFormatting);
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  final locales = <String, (Translator, TextDirection)>{
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
  };

  for (final theme in AppThemeId.values) {
    for (final scale in [1.0, 1.1]) {
      for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
        testWidgets(
            'channels selection fits 360 dp: ${theme.name} $name '
            'x$scale', (tester) async {
          useNarrowPhone(tester);
          final channels = FakeChannelsRepository()
            ..listed = [
              fakeChannel(
                subscribed: true,
                title: 'Международная налоговая ${'консультация' * 4}',
                username: 'a_very_long_channel_username_32ch',
              ),
            ];
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                ...channelsOverrides(channels, translator: t),
                groupRepositoryProvider.overrideWithValue(
                  FakeGroupRepository([listGroup('g1'), listGroup('g2')]),
                ),
              ],
              child: MaterialApp(
                theme: AppTheme.of(theme),
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
                home: const ChannelsScreen(),
              ),
            ),
          );
          await tester.pumpAndSettle();

          // Groups: from the long-press sheet.
          await tester.longPress(find.byKey(const ValueKey('group-tile-g1')));
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const ValueKey('group-menu-select')));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.byType(ChatSelectionBar), findsOneWidget);
          await tester.tap(find.byKey(const ValueKey('select-all')));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          for (final k in [
            'select-cancel',
            'select-count',
            'select-all',
            'select-archive',
            'select-pin',
            'select-mute',
            'select-read',
            'select-delete',
          ]) {
            final r = tester.getRect(find.byKey(ValueKey(k)));
            expect(r.left, greaterThanOrEqualTo(0), reason: k);
            expect(r.right, lessThanOrEqualTo(narrowPhone.width), reason: k);
          }

          // Channels: a long press on a followed channel.
          await tester.tap(find.text(t.t('channel.title')).last);
          await tester.pumpAndSettle();
          await tester.longPress(
            find.byKey(const ValueKey('channel-row-ch-1')),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(
            find.byKey(const ValueKey('channel-pick-ch-1')),
            findsOneWidget,
          );

          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(minutes: 5));
        });
      }
    }
  }
}
