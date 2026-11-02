import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/presentation/sections_archive.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/domain/demo_models.dart';
import 'package:lawbid/features/demo/presentation/demo_section.dart';

import '../helpers/long_locale.dart';
import '../helpers/overflow_fixtures.dart';
import '../helpers/overflow_harness.dart';

/// Owner 2026-11-02, batch 6 of the screens no overflow test had covered:
/// the demo accounts section and its role picker, the "Archive (N)" row of
/// a section, and the footer of a paginated list (loading, error, end).
/// 360 dp, the longest text of every key, right-to-left, ne, de, mr, ar, ru,
/// at text scale 1 and 1.3; then the four themes.
typedef _Case = (
  Widget Function() build,
  Future<void> Function(WidgetTester) act,
  List<Override> extra,
);

final _demoMe = DemoMe(
  enabled: true,
  canCreate: true,
  maxAccounts: 1000000,
  ttlDays: 9999,
  accounts: [
    for (final role in DemoRole.values)
      DemoAccount(
        id: role.wire,
        role: role,
        displayName: longTitle,
        createdAt: DateTime(2026, 10),
        lastSeenAt: DateTime(2026, 11),
        expiresAt: DateTime(2026, 12),
      ),
  ],
);

/// The footer in one of its states, with the app's real pagination keys.
Widget _footer(AppPaginationStatus status) => Scaffold(
      body: Consumer(
        builder: (context, ref, _) {
          final t = ref.watch(translatorProvider);
          return AppPaginationFooter(
            status: status,
            labels: AppPaginationLabels(
              loadingMore: t.t('pagination.loadingMore'),
              error: t.t('pagination.error'),
              retry: t.t('error.retry'),
              end: t.t('pagination.end'),
            ),
            onRetry: () {},
          );
        },
      ),
    );

void main() {
  setUpAll(initializeDateFormatting);

  final demo = [demoMeProvider.overrideWith((_) async => _demoMe)];

  final cases = <String, _Case>{
    'demo section': (
      () => const Scaffold(body: SingleChildScrollView(child: DemoSection())),
      overflowShows(find.byKey(const ValueKey('demo-enter-client'))),
      demo,
    ),
    'demo role picker': (
      () => const Scaffold(
            body: SingleChildScrollView(child: DemoSection()),
          ),
      (tester) async {
        await tester.pump(const Duration(seconds: 2));
        await tester.ensureVisible(find.byKey(const ValueKey('demo-create')));
        await tester.tap(find.byKey(const ValueKey('demo-create')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));
        expect(find.byKey(const ValueKey('demo-role-client')), findsOneWidget);
      },
      demo,
    ),
    'section archive row': (
      () => const Scaffold(
            body: SectionArchiveRow(count: 99999999, route: '/x'),
          ),
      overflowShows(find.byKey(const ValueKey('section-archive-row'))),
      const [],
    ),
    'pagination footer (loading)': (
      () => _footer(AppPaginationStatus.loading),
      overflowShows(find.byType(AppPaginationFooter)),
      const [],
    ),
    'pagination footer (error)': (
      () => _footer(AppPaginationStatus.error),
      overflowShows(find.byType(AppButton)),
      const [],
    ),
    'pagination footer (end)': (
      () => _footer(AppPaginationStatus.end),
      overflowShows(find.byType(AppPaginationFooter)),
      const [],
    ),
  };

  // Every language at both scales, then the four themes in the longest text.
  final variants = <(String, Translator, TextDirection, double, AppThemeId)>[
    for (final scale in overflowScales)
      for (final MapEntry(key: name, value: (t, dir))
          in overflowLocales().entries)
        ('$name, x$scale', t, dir, scale, AppThemeId.day),
    for (final themeId in overflowThemes)
      (
        'themes (${themeId.name}, longest, x1.3)',
        LongestTranslator(),
        TextDirection.ltr,
        DeviceTextScale.shellMax,
        themeId,
      ),
  ];

  for (final (name, t, dir, scale, themeId) in variants) {
    group('batch 6: no overflow at 360 dp ($name)', () {
      for (final MapEntry(key: label, value: (build, act, extra))
          in cases.entries) {
        testWidgets(label, (tester) async {
          await pumpOverflowApp(
            tester,
            build(),
            t: t,
            dir: dir,
            scale: scale,
            theme: themeId,
            extra: extra,
            act: act,
          );
        });
      }
    });
  }
}
