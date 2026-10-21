import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channels_screen.dart';
import 'package:lawbid/features/channels/presentation/community_archive.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../features/channels/channels_fakes.dart';
import '../features/groups/fake_group_repository.dart';
import '../helpers/long_locale.dart';
import '../helpers/pending_strings.dart';

/// Owner 2026-10-21 (inbox 22c / 22d / 27): the Channels screen's actions on
/// a 360 dp phone in every theme, ru / ne / ar / de / mr, text ×1 and ×1.1
/// — the «Archive» rows, a channel row with its crossed bell, pin and
/// unread count, the channel and group menus, the «mute for…» sheet and
/// the Channels archive screen.
void main() {
  setUpAll(initializeDateFormatting);
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  final locales = <String, (Translator, TextDirection)>{
    'ru': (
      withPending(
        L10nTranslator(language: AppLanguage.ru, cache: const {}),
        'ru',
      ),
      TextDirection.ltr,
    ),
    'ne': (withPending(ShippedTranslator('ne'), 'ne'), TextDirection.ltr),
    'ar': (withPending(ShippedTranslator('ar'), 'ar'), TextDirection.rtl),
    'de': (withPending(ShippedTranslator('de'), 'de'), TextDirection.ltr),
    'mr': (withPending(ShippedTranslator('mr'), 'mr'), TextDirection.ltr),
  };

  Channel longChannel(String id, {bool archived = false}) => fakeChannel(
        id: id,
        subscribed: true,
        role: ChannelRole.owner,
        title: 'Международная налоговая ${'консультация' * 4}',
        username: 'a_very_long_channel_username_32ch',
        pinned: true,
        archived: archived,
        unread: 1234,
        mutedUntil: DateTime.now().add(const Duration(days: 2)),
      );

  for (final theme in AppThemeId.values) {
    for (final scale in [1.0, 1.1]) {
      for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
        Widget app(Widget home, FakeChannelsRepository channels) =>
            ProviderScope(
              overrides: [
                ...channelsOverrides(channels, translator: t),
                groupRepositoryProvider.overrideWithValue(
                  FakeGroupRepository([listGroup('g1', unread: 3)])
                    ..archivedItems = [listGroup('g7')],
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
                home: home,
              ),
            );

        void fits(WidgetTester tester, List<String> keys) {
          expect(tester.takeException(), isNull);
          for (final k in keys) {
            final r = tester.getRect(find.byKey(ValueKey(k)).first);
            expect(r.left, greaterThanOrEqualTo(-0.5), reason: k);
            expect(
              r.right,
              lessThanOrEqualTo(narrowPhone.width + 0.5),
              reason: k,
            );
          }
        }

        testWidgets('channels actions fit 360 dp: ${theme.name} $name x$scale',
            (tester) async {
          useNarrowPhone(tester);
          final channels = FakeChannelsRepository()
            ..listed = [longChannel('ch-1')]
            ..archivedList = [longChannel('ch-9', archived: true)];
          await tester.pumpWidget(app(const ChannelsScreen(), channels));
          await tester.pumpAndSettle();
          // Mine: the full set of actions.
          await tester.tap(find.text(t.t('channel.tab.mine')).first);
          await tester.pumpAndSettle();

          // Groups: «Archive» on top, the group menu.
          fits(tester, ['groups-archive-row', 'groups-archive-count']);
          await tester.longPress(find.byKey(const ValueKey('group-tile-g1')));
          await tester.pumpAndSettle();
          fits(tester, ['group-menu-mute', 'group-menu-leave']);
          await tester.tap(find.byKey(const ValueKey('group-menu-mute')));
          await tester.pumpAndSettle();
          // The «mute for…» sheet.
          fits(tester, [
            'mute-for-title',
            'mute-for-hour',
            'mute-for-hours8',
            'mute-for-days2',
            'mute-for-forever',
          ]);
          await tester.tapAt(const Offset(10, 10));
          await tester.pumpAndSettle();

          // Channels: «Archive», the marks of a row, its menu.
          await tester.tap(find.text(t.t('channel.title')).last);
          await tester.pumpAndSettle();
          fits(tester, [
            'channels-archive-row',
            'channel-muted-ch-1',
            'channel-pinned-ch-1',
            'channel-unread-ch-1',
          ]);
          await tester
              .longPress(find.byKey(const ValueKey('channel-row-ch-1')));
          await tester.pumpAndSettle();
          fits(tester, [
            'channel-menu-row-pin',
            'channel-menu-row-mute',
            'channel-menu-row-read',
            'channel-menu-row-archive',
            'channel-menu-row-delete',
          ]);

          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(minutes: 5));
        });

        testWidgets('channels archive fits 360 dp: ${theme.name} $name x$scale',
            (tester) async {
          useNarrowPhone(tester);
          final channels = FakeChannelsRepository()
            ..archivedList = [longChannel('ch-9', archived: true)];
          await tester.pumpWidget(
            app(const CommunityArchiveScreen(channels: true), channels),
          );
          await tester.pumpAndSettle();
          fits(tester, ['community-archive-title', 'channel-row-ch-9']);
          await tester
              .longPress(find.byKey(const ValueKey('channel-row-ch-9')));
          await tester.pumpAndSettle();
          await tester
              .tap(find.byKey(const ValueKey('channel-menu-row-select')));
          await tester.pumpAndSettle();
          fits(tester, [
            'select-archive',
            'select-pin',
            'select-mute',
            'select-read',
            'select-delete',
          ]);
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(minutes: 5));
        });
      }
    }
  }
}
