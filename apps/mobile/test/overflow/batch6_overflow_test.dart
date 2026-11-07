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

DemoMe _demoMe({bool canCreate = true, bool noAccounts = false}) => DemoMe(
      enabled: true,
      canCreate: canCreate,
      maxAccounts: 1000000,
      ttlDays: 9999,
      accounts: [
        if (!noAccounts)
          for (final role in DemoRole.values)
            DemoAccount(
              id: role.wire,
              role: role,
              displayName: longTitle,
              createdAt: DateTime(2026, 10),
              lastSeenAt:
                  role == DemoRole.assistant ? null : DateTime(2026, 11),
              expiresAt: DateTime(2026, 12),
            ),
      ],
    );

const _demoHome = Scaffold(
  body: SingleChildScrollView(child: DemoSection()),
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

  List<Override> demo({bool canCreate = true, bool noAccounts = false}) => [
        demoMeProvider.overrideWith(
          (_) async => _demoMe(canCreate: canCreate, noAccounts: noAccounts),
        ),
      ];

  final cases = <String, _Case>{
    'demo section': (
      () => _demoHome,
      overflowShows(find.byKey(const ValueKey('demo-section'))),
      demo(),
    ),
    'demo section (limit reached)': (
      () => _demoHome,
      overflowShows(find.byKey(const ValueKey('demo-account-client'))),
      demo(canCreate: false),
    ),
    'demo section (no accounts)': (
      () => _demoHome,
      overflowShows(find.byKey(const ValueKey('demo-create'))),
      demo(noAccounts: true),
    ),
    'demo role picker': (
      () => _demoHome,
      (tester) async {
        await overflowShows(find.byKey(const ValueKey('demo-create')))(tester);
        await tester.ensureVisible(find.byKey(const ValueKey('demo-create')));
        await tester.tap(find.byKey(const ValueKey('demo-create')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));
        for (final role in DemoRole.values) {
          expect(
            find.byKey(ValueKey('demo-role-${role.wire}')),
            findsOneWidget,
          );
        }
      },
      demo(),
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
      overflowShows(find.byKey(const ValueKey(AppPaginationStatus.loading))),
      const [],
    ),
    'pagination footer (error)': (
      () => _footer(AppPaginationStatus.error),
      overflowShows(find.byKey(const ValueKey(AppPaginationStatus.error))),
      const [],
    ),
    'pagination footer (end)': (
      () => _footer(AppPaginationStatus.end),
      overflowShows(find.byKey(const ValueKey(AppPaginationStatus.end))),
      const [],
    ),
  };

  // Every language at both scales, then the other themes in the longest text
  // (day is the language loop's longest at x1.3).
  final variants = <(String, Translator, TextDirection, double, AppThemeId)>[
    for (final scale in overflowScales)
      for (final MapEntry(key: name, value: (t, dir))
          in overflowLocales().entries)
        ('$name, x$scale', t, dir, scale, AppThemeId.day),
    for (final themeId in overflowThemes.where((x) => x != AppThemeId.day))
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
