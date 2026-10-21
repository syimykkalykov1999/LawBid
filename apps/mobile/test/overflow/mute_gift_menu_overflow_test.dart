import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_section.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/presentation/gift_widgets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-21: «Mute» with a choice of time, «Mute calls», and «Give»
/// in the profile's ⋯ menu, on a 360 dp phone at text x1 and x1.1 in the
/// longest translation, ne, ru, ar (RTL), de, mr, in all four themes.
void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  for (final id in AppThemeId.values) {
    for (final scale in [1.0, 1.1]) {
      for (final e in locales.entries) {
        testWidgets('mute and gift rows: ${id.name} ${e.key} x$scale',
            (t) async {
          useNarrowPhone(t);
          final (tr, dir) = e.value;
          final overrides = <Override>[
            ...uxOverrides(translator: tr),
            starsEnabledProvider.overrideWithValue(true),
            isAssistantProvider.overrideWithValue(false),
          ];
          await t.pumpWidget(
            uxApp(
              Directionality(
                textDirection: dir,
                child: Scaffold(
                  body: Builder(
                    builder: (context) => ListView(
                      children: [
                        AppListRow(
                          icon: AppIcons.notificationsOffOutlined,
                          label: tr.t('mute.calls'),
                          subtitle: tr.t('mute.callsNote'),
                          trailingText: tr.t('contact.on'),
                          showChevron: false,
                          onTap: () {},
                        ),
                        GroupInfoSwitchRow(
                          icon: AppIcons.notificationsOffOutlined,
                          label: tr.t('mute.calls'),
                          subtitle: tr.t('mute.callsNote'),
                          value: true,
                          onChanged: (_) {},
                        ),
                        GiftMenuRow(
                          userId: 'u1',
                          sheet: context,
                          screen: context,
                        ),
                        TextButton(
                          onPressed: () => showGroupChoiceSheet<int>(
                            context,
                            title: tr.t('group.info.mute.title'),
                            choices: [
                              GroupChoice(
                                value: 0,
                                label: tr.t('group.info.mute.off'),
                              ),
                              GroupChoice(
                                value: 1,
                                label: tr.t('group.info.mute.hour'),
                              ),
                              GroupChoice(
                                value: 2,
                                label: tr.t('group.info.mute.hours8'),
                              ),
                              GroupChoice(
                                value: 3,
                                label: tr.t('group.info.mute.week'),
                              ),
                              GroupChoice(
                                value: 4,
                                label: tr.t('group.info.mute.forever'),
                              ),
                            ],
                          ),
                          child: const Text('open'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              theme: AppTheme.of(id),
              size: narrowPhone,
              textScale: scale,
              disableAnimations: true,
              overrides: overrides,
            ),
          );
          await t.pump(const Duration(milliseconds: 300));
          expect(t.takeException(), isNull);
          expect(find.byKey(const ValueKey('profile-give-gift')), findsOne);
          await t.tap(find.text('open'));
          await t.pumpAndSettle();
          expect(t.takeException(), isNull);
          await t.pumpWidget(const SizedBox());
          await t.pump(const Duration(seconds: 30));
        });
      }
    }
  }
}
