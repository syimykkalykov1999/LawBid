// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

/// Owner 2026-09-30: every qualification everywhere, suggestions while
/// typing, Mine search keys, opt-in alert taps.
void main() {
  const tree = [
    PracticeCategory(
      id: 'c1',
      i18nKey: 'practice.civil_litigation',
      nameEn: 'Civil Litigation',
      children: [
        PracticeLeaf(
          id: 'l1',
          i18nKey:
              'practice.civil_litigation.arbitration_and_mediation_representation',
          nameEn: 'Arbitration and Mediation Representation',
        ),
        PracticeLeaf(
          id: 'l2',
          i18nKey: 'practice.civil_litigation.appeals',
          nameEn: 'Appeals',
        ),
      ],
    ),
    PracticeCategory(
      id: 'c2',
      i18nKey: 'practice.family_law',
      nameEn: 'Family Law',
      children: [
        PracticeLeaf(
          id: 'l3',
          i18nKey: 'practice.family_law.divorce',
          nameEn: 'Divorce',
        ),
      ],
    ),
  ];
  final t = _KeysTranslator();

  test('picker options hold every category and every subcategory', () {
    final options = practicePickerOptions(t, tree);
    expect(options.map((o) => o.value), [
      'civil_litigation',
      'civil_litigation.arbitration_and_mediation_representation',
      'civil_litigation.appeals',
      'family_law',
      'family_law.divorce',
    ]);
    final arbitration = options[1];
    expect(arbitration.nested, isTrue);
    expect(arbitration.group, 'Civil Litigation');
  });

  test('suggestions: label starts first, every word must match, group counts',
      () {
    final options = practicePickerOptions(t, tree);
    expect(
      suggestOptions(options, 'arb').map((o) => o.value),
      ['civil_litigation.arbitration_and_mediation_representation'],
    );
    // "civil appeals": the group (category) matches "civil".
    expect(
      suggestOptions(options, 'civil appeals').map((o) => o.value),
      ['civil_litigation.appeals'],
    );
    expect(suggestOptions(options, 'zzz'), isEmpty);
    expect(suggestOptions(options, ''), options);
    // Starts-with ranks before contains.
    final ranked = suggestOptions(
      const [
        PickerOption(value: 'a', label: 'Tax disputes'),
        PickerOption(value: 'b', label: 'Disputes about land'),
      ],
      'disp',
    );
    expect(ranked.first.value, 'b');
  });

  test('codes, categories and labels', () {
    expect(practiceCodeOf('practice.family_law.divorce'), 'family_law.divorce');
    expect(practiceCategoryOf('family_law.divorce'), 'family_law');
    expect(isPracticeCategory('family_law'), isTrue);
    expect(isPracticeCategory('family_law.divorce'), isFalse);
    expect(practiceLabelFrom(t, tree, 'civil_litigation.appeals'), 'Appeals');
    expect(practiceLabelFrom(t, null, 'family_law'), 'Family Law');
  });

  test('the topic slider keeps subcategories in the order picked', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final n = c.read(feedTopicsProvider.notifier);
    // ignore: cascade_invocations
    n.set({'family_law'});
    n.set({
      'family_law',
      'civil_litigation.arbitration_and_mediation_representation',
    });
    expect(c.read(feedTopicsProvider), [
      'family_law',
      'civil_litigation.arbitration_and_mediation_representation',
    ]);
    n.set({'civil_litigation.arbitration_and_mediation_representation'});
    expect(
      c.read(feedTopicsProvider),
      ['civil_litigation.arbitration_and_mediation_representation'],
    );
  });

  test('Mine search is a value (provider key) and counts filters', () {
    const a = MineSearch(q: 'fence', practice: 'real_estate');
    expect(a, const MineSearch(q: 'fence', practice: 'real_estate'));
    expect(a.filterCount, 1);
    final b = a.copyWith(state: () => 'IL', practice: () => null);
    expect(b.practice, isNull);
    expect(b.state, 'IL');
    expect(b.q, 'fence');
    expect(const MineSearch().isEmpty, isTrue);
  });

  test('opt-in alerts open the post / the case', () {
    expect(
      notificationRoute(
        type: 'followed_post',
        payload: {'postId': 'p1'},
        attorney: false,
      ),
      '/post/p1',
    );
    expect(
      notificationRoute(
        type: 'new_case',
        payload: {'caseId': 'k1'},
        attorney: true,
      ),
      isNotNull,
    );
  });
}

/// Returns the key: practice names fall back to the English seed name.
class _KeysTranslator implements Translator {
  @override
  String t(String key, [Map<String, String>? params]) => key;

  @override
  String plural(String key, num count, [Map<String, String>? params]) => key;
}
