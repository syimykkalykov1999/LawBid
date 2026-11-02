import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/practice/practice_search.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

/// `practice.family_law.divorce` → `family_law.divorce`.
String _codeOf(String i18nKey) =>
    i18nKey.startsWith('practice.') ? i18nKey.substring(9) : i18nKey;

/// Every category and sub-area of [tree] with its names, for
/// [rankPractices].
List<PracticeEntry> practiceEntries(
  List<PracticeCategory> tree,
  String Function(String i18nKey, String nameEn) localName,
) =>
    [
      for (final c in tree) ...[
        PracticeEntry(
          code: _codeOf(c.i18nKey),
          localName: localName(c.i18nKey, c.nameEn),
          englishName: c.nameEn,
        ),
        for (final l in c.children)
          PracticeEntry(
            code: l.code ?? _codeOf(l.i18nKey),
            localName: localName(l.i18nKey, l.nameEn),
            englishName: l.nameEn,
          ),
      ],
    ];

/// Owner 2026-10-15 / 2026-10-28: practices the typed text names — by the
/// name in the app's language, the English name or an everyday word
/// («развод», «ДТП», «DUI»), with one typo — best first (code → the word
/// that matched when it is not the local name). Local: reads the practice
/// tree the app already holds, no server call (owner 2026-10-28). Every
/// practice picker, the case wizard and the topic / case filters use it.
final practiceMatchesProvider = FutureProvider.autoDispose
    .family<Map<String, String?>, String>((ref, q) async {
  final text = q.trim();
  if (text.length < 2) return const {};
  final t = ref.watch(translatorProvider);
  final tree = await ref.watch(practiceTreeProvider.future);
  return rankPractices(
    text,
    practiceEntries(tree, (key, en) => CaseFormat.practice(t, key, en)),
  );
});
