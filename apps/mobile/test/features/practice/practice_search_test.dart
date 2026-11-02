import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/practice/practice_matches.dart';
import 'package:lawbid/features/practice/practice_search.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

import '../../helpers/ux_harness.dart';

/// A slice of the real practice tree (practice_areas.seed.json).
const _tree = [
  PracticeCategory(
    id: 'c-fam',
    i18nKey: 'practice.family_law',
    nameEn: 'Family Law',
    children: [
      PracticeLeaf(
        id: 'l-div',
        i18nKey: 'practice.family_law.divorce',
        nameEn: 'Divorce',
        code: 'family_law.divorce',
      ),
      PracticeLeaf(
        id: 'l-cus',
        i18nKey: 'practice.family_law.child_custody',
        nameEn: 'Child Custody',
        code: 'family_law.child_custody',
      ),
      PracticeLeaf(
        id: 'l-mil',
        i18nKey: 'practice.family_law.military_divorce',
        nameEn: 'Military Divorce',
        code: 'family_law.military_divorce',
      ),
    ],
  ),
  PracticeCategory(
    id: 'c-pi',
    i18nKey: 'practice.personal_injury',
    nameEn: 'Personal Injury',
    children: [
      PracticeLeaf(
        id: 'l-car',
        i18nKey: 'practice.personal_injury.car_accident',
        nameEn: 'Car Accident',
        code: 'personal_injury.car_accident',
      ),
      PracticeLeaf(
        id: 'l-truck',
        i18nKey: 'practice.personal_injury.truck_accident',
        nameEn: 'Truck Accident',
        code: 'personal_injury.truck_accident',
      ),
    ],
  ),
  PracticeCategory(
    id: 'c-imm',
    i18nKey: 'practice.immigration',
    nameEn: 'Immigration',
    children: [
      PracticeLeaf(
        id: 'l-gc',
        i18nKey: 'practice.immigration.green_card',
        nameEn: 'Green Card',
        code: 'immigration.green_card',
      ),
      PracticeLeaf(
        id: 'l-dep',
        i18nKey: 'practice.immigration.deportation_and_removal_defense',
        nameEn: 'Deportation and Removal Defense',
        code: 'immigration.deportation_and_removal_defense',
      ),
    ],
  ),
  PracticeCategory(
    id: 'c-dui',
    i18nKey: 'practice.dui_and_dwi',
    nameEn: 'DUI and DWI',
    children: [
      PracticeLeaf(
        id: 'l-dui1',
        i18nKey: 'practice.dui_and_dwi.first_offense_dui',
        nameEn: 'First Offense DUI',
        code: 'dui_and_dwi.first_offense_dui',
      ),
    ],
  ),
];

/// Russian names, as the synced bundle gives them.
const _ru = {
  'practice.family_law': 'Семейное право',
  'practice.family_law.divorce': 'Развод',
  'practice.family_law.child_custody': 'Опека над детьми',
  'practice.family_law.military_divorce': 'Развод военнослужащих',
  'practice.personal_injury': 'Причинение вреда здоровью',
  'practice.personal_injury.car_accident': 'ДТП',
  'practice.personal_injury.truck_accident': 'Авария с грузовиком',
  'practice.immigration': 'Иммиграция',
  'practice.immigration.green_card': 'Грин-карта',
  'practice.immigration.deportation_and_removal_defense':
      'Защита от депортации',
  'practice.dui_and_dwi': 'Вождение в нетрезвом виде (DUI)',
  'practice.dui_and_dwi.first_offense_dui': 'Первое нарушение DUI',
};

List<PracticeEntry> _entries({bool ru = false}) => practiceEntries(
      _tree,
      (key, en) => ru ? (_ru[key] ?? en) : en,
    );

List<String> _codes(String q, {bool ru = false}) =>
    rankPractices(q, _entries(ru: ru)).keys.toList();

/// Practice names live in the synced bundle: unknown here → English name.
class _Tr extends StaticTranslatorEn {
  const _Tr();

  @override
  String t(String key, [Map<String, String>? params]) =>
      key.startsWith('practice.') ? key : super.t(key, params);
}

void main() {
  group('rankPractices (owner 2026-10-28, local, RU + EN)', () {
    test('English: the name, best first; sub-areas and groups', () {
      expect(_codes('divorce').first, 'family_law.divorce');
      expect(
        _codes('divorce'),
        containsAllInOrder(
          ['family_law.divorce', 'family_law.military_divorce'],
        ),
      );
      expect(_codes('car accident').first, 'personal_injury.car_accident');
      expect(_codes('accident').first, 'personal_injury.car_accident');
      expect(_codes('green').first, 'immigration.green_card');
      expect(_codes('family'), contains('family_law'));
    });

    test('Russian app: the Russian name and everyday words', () {
      expect(_codes('развод', ru: true).first, 'family_law.divorce');
      expect(_codes('авария', ru: true).first, 'personal_injury.car_accident');
      expect(_codes('дтп', ru: true).first, 'personal_injury.car_accident');
      expect(
        _codes('депортация', ru: true).first,
        'immigration.deportation_and_removal_defense',
      );
      expect(_codes('грин-карта', ru: true).first, 'immigration.green_card');
      expect(_codes('грин карта', ru: true).first, 'immigration.green_card');
      expect(_codes('пьяный за рулём', ru: true).first, 'dui_and_dwi');
      expect(_codes('DUI', ru: true).first, 'dui_and_dwi');
    });

    test('either language works in either app', () {
      expect(_codes('развод').first, 'family_law.divorce');
      expect(_codes('divorce', ru: true).first, 'family_law.divorce');
      // The English name is the matched word in a Russian app.
      expect(
        rankPractices('divorce', _entries(ru: true))['family_law.divorce'],
        'Divorce',
      );
    });

    test('one typo from 4 letters; nonsense and 1 letter find nothing', () {
      expect(_codes('divorse').first, 'family_law.divorce');
      expect(
        _codes('депортацыя', ru: true).first,
        'immigration.deportation_and_removal_defense',
      );
      expect(_codes('xyzq'), isEmpty);
      expect(_codes('d'), isEmpty);
    });
  });

  testWidgets(
      'case wizard step 1: «авария» lists «ДТП» first under its group, '
      'no server call', (tester) async {
    var draft = const CaseDraft();
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: PracticeStep(draft: draft, onChange: (f) => draft = f(draft)),
        ),
        theme: AppTheme.light(),
        overrides: [
          ...uxOverrides(translator: const _Tr()),
          practiceTreeProvider.overrideWith((ref) async => _tree),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'accident');
    await tester.pumpAndSettle();
    final car = tester.getTopLeft(find.text('Car Accident')).dy;
    final truck = tester.getTopLeft(find.text('Truck Accident')).dy;
    expect(car, lessThan(truck));
    // The group is the caption of each sub-area.
    expect(find.text('Personal Injury'), findsNWidgets(2));
    expect(find.byKey(const ValueKey('practice-no-match')), findsNothing);

    await tester.enterText(find.byType(TextField), 'divorse');
    await tester.pumpAndSettle();
    expect(find.text('Divorce'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'qqqq');
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('practice-no-match')), findsOneWidget);
  });
}
