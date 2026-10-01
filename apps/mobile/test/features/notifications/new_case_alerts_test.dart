
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/new_case_alerts_section.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

import '../../helpers/ux_harness.dart';

/// Practice names come from the server's i18n bundle; here the seed
/// English names stand in (a missing key falls back to nameEn).
class _Translator extends StaticTranslatorEn {
  const _Translator();

  @override
  String t(String key, [Map<String, String>? params]) =>
      key.startsWith('practice.') && !key.startsWith('practice.search')
          ? key
          : super.t(key, params);
}

const _tree = [
  PracticeCategory(
    id: 'fam',
    i18nKey: 'practice.family_law',
    nameEn: 'Family Law',
    children: [
      PracticeLeaf(
          id: 'div', i18nKey: 'practice.family_law.divorce', nameEn: 'Divorce'),
    ],
  ),
  PracticeCategory(
    id: 'imm',
    i18nKey: 'practice.immigration',
    nameEn: 'Immigration',
    children: [],
  ),
];

class _Repo implements NotificationsRepository {
  NewCaseAlerts alerts = const NewCaseAlerts(
    useProfile: true,
    practiceAreaIds: [],
    profilePracticeAreaIds: ['div'],
  );
  final calls = <String>[];

  @override
  Future<NewCaseAlerts> newCaseAlerts() async => alerts;

  @override
  Future<NewCaseAlerts> setNewCaseAlerts({
    required bool useProfile,
    List<String>? practiceAreaIds,
  }) async {
    calls.add('set:$useProfile:${practiceAreaIds?.join(',')}');
    return alerts = NewCaseAlerts(
      useProfile: useProfile,
      practiceAreaIds: practiceAreaIds ?? alerts.practiceAreaIds,
      profilePracticeAreaIds: alerts.profilePracticeAreaIds,
    );
  }

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

/// Owner 2026-10-01: new-case alerts by qualification.
void main() {
  testWidgets("profile's by default; choosing others saves a custom list",
      (tester) async {
    final repo = _Repo();
    tester.view.physicalSize = const Size(1000, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(uxApp(
      const Scaffold(body: SingleChildScrollView(child: NewCaseAlertsSection())),
      size: const Size(1000, 2400),
      theme: AppTheme.light(),
      disableAnimations: true,
      overrides: uxOverrides(translator: const _Translator(), extra: [
        notificationsRepositoryProvider.overrideWithValue(repo),
        practiceTreeProvider.overrideWith((ref) async => _tree),
      ]),
    ));
    await tester.pumpAndSettle();
    expect(find.text('As in my profile'), findsOneWidget);
    expect(find.text('Divorce'), findsOneWidget, reason: 'profile preview');
    await tester.tap(find.byKey(const ValueKey('alerts-choose')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Immigration').last);
    await tester.pumpAndSettle();
    // Confirm the multi-select sheet.
    await tester.tap(find.textContaining('Done'));
    await tester.pumpAndSettle();
    expect(repo.calls.single, startsWith('set:false:'));
    expect(repo.calls.single, contains('imm'));
    expect(repo.calls.single, contains('div'), reason: 'starts from profile');
  });
}

