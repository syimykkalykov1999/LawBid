import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

/// Owner 2026-09-30: every qualification — the 42 practice categories and
/// every subcategory — in every filter and every "+" form.

/// `practice.civil_litigation.appeals` → `civil_litigation.appeals`.
String practiceCodeOf(String i18nKey) =>
    i18nKey.startsWith('practice.') ? i18nKey.substring(9) : i18nKey;

/// The category of a qualification code (`civil_litigation.appeals` →
/// `civil_litigation`).
String practiceCategoryOf(String code) => code.split('.').first;

bool isPracticeCategory(String code) => !code.contains('.');

/// A qualification's display name: the localized tree when loaded, the
/// English seed name of a category otherwise.
String practiceLabelFrom(
  Translator t,
  List<PracticeCategory>? tree,
  String code,
) {
  for (final c in tree ?? const <PracticeCategory>[]) {
    if (practiceCodeOf(c.i18nKey) == code) {
      return CaseFormat.practice(t, c.i18nKey, c.nameEn);
    }
    if (practiceCodeOf(c.i18nKey) == practiceCategoryOf(code)) {
      for (final l in c.children) {
        if (practiceCodeOf(l.i18nKey) == code) {
          return CaseFormat.practice(t, l.i18nKey, l.nameEn);
        }
      }
    }
  }
  final seed = kPracticeCategoryNamesEn[code];
  if (seed != null) return seed;
  final last = code.split('.').last.replaceAll('_', ' ');
  return last.isEmpty ? code : last[0].toUpperCase() + last.substring(1);
}

String practiceLabel(WidgetRef ref, String code) => practiceLabelFrom(
      ref.read(translatorProvider),
      ref.watch(practiceTreeProvider).value,
      code,
    );

/// Picker options: each category followed by its subcategories (nested;
/// in suggestions a subcategory shows its category under it).
List<PickerOption> practicePickerOptions(
  Translator t,
  List<PracticeCategory>? tree,
) {
  if (tree == null || tree.isEmpty) {
    return [
      for (final c in kPracticeCategoryCodes)
        PickerOption(value: c, label: kPracticeCategoryNamesEn[c] ?? c),
    ];
  }
  return [
    for (final c in tree) ...[
      PickerOption(
        value: practiceCodeOf(c.i18nKey),
        label: CaseFormat.practice(t, c.i18nKey, c.nameEn),
      ),
      for (final l in c.children)
        PickerOption(
          value: practiceCodeOf(l.i18nKey),
          label: CaseFormat.practice(t, l.i18nKey, l.nameEn),
          group: CaseFormat.practice(t, c.i18nKey, c.nameEn),
          nested: true,
        ),
    ],
  ];
}

List<PickerOption> practiceOptions(WidgetRef ref) => practicePickerOptions(
      ref.read(translatorProvider),
      ref.watch(practiceTreeProvider).value,
    );
