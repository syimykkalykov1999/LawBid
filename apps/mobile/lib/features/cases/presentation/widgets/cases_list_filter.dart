import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';

/// Owner 2026-11-09: the filter icon of the cases screen — left of the
/// search magnifier, the app's filter icon (the one inside the Mine search
/// field) with the count of the filters that are on.
class CasesListFilterButton extends ConsumerWidget {
  const CasesListFilterButton({
    required this.search,
    required this.onChanged,
    required this.attorney,
    super.key,
  });

  final MineSearch search;
  final ValueChanged<MineSearch> onChanged;

  /// The attorney's «Active» work: no «Новые» / «Открыт» / «Ждёт меня»
  /// (an accepted case is never open), stages 3..4 only.
  final bool attorney;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final count = search.listFilterCount;
    return Badge(
      isLabelVisible: count > 0,
      label: Text(ref.watch(l10nFormatsProvider).number(count)),
      backgroundColor: colors.gold,
      textColor: colors.navy,
      child: AppIconButton(
        key: const ValueKey('cases-list-filter'),
        compact: true,
        icon: AppIcon(
          AppIcons.tuneRounded,
          color: count > 0 ? colors.iconTint : colors.text,
        ),
        semanticLabel: t.t('mine.search.filters'),
        onPressed: () async {
          final next = await showCasesListFilterSheet(
            context,
            ref,
            search,
            attorney: attorney,
          );
          if (next != null) onChanged(next);
        },
      ),
    );
  }
}

/// The stages a client's «Active» list can hold (0..3; «Done» is its own
/// tab) and the attorney's (2..3).
List<int> casesListStages({required bool attorney}) =>
    attorney ? const [2, 3] : const [0, 1, 2, 3];

/// A one-line label of the picked stages: «Все», or «Этап 1 из 5, Этап 3 из 5».
String casesListStagesLabel(Translator t, Set<int> stages) => stages.isEmpty
    ? t.t('tasks.filter.all')
    : ([...stages]..sort())
        .map((s) => t.t('mine.stage.short', {'n': '${s + 1}'}))
        .join(', ');

/// The label of a date order (the «Дата» row and its picker). The newest /
/// oldest words are the reviews' sort words, already in every language.
String sortLabelOf(Translator t, CasesSort sort) => switch (sort) {
      CasesSort.stage => t.t('mine.listFilter.sort.stage'),
      CasesSort.newest => t.t('reviews.sort.newest'),
      CasesSort.oldest => t.t('reviews.sort.oldest'),
    };

/// Owner 2026-11-09: the filter sheet of the cases screen — the bottom
/// sheet of rows the Mine search filters use (AppListRow, a picker for a
/// list choice). «Новые» (no attorney replies yet = stage 1), «По этапам»
/// (several), «В работе» / «Открыт» / «Ждёт меня», «Дата» (new → old, old
/// → new; the default is the stage order). Returns the new filter, or null
/// when nothing was chosen.
Future<MineSearch?> showCasesListFilterSheet(
  BuildContext context,
  WidgetRef ref,
  MineSearch s, {
  required bool attorney,
}) async {
  final t = ref.read(translatorProvider);
  bool only(Set<int> stages) =>
      !s.awaiting &&
      s.stages.length == stages.length &&
      s.stages.containsAll(stages);
  final isNew = only(const {0});
  final inWork = only(const {2});
  final isOpen = only(const {0, 1});
  // The row's short label; the picker spells the default out.
  final sortLabel = s.sort == CasesSort.stage
      ? t.t('mine.listFilter.stages')
      : sortLabelOf(t, s.sort);
  final choice = await showAppBottomSheet<String>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AppSheetHandle(),
          if (!attorney)
            AppListRow(
              key: const ValueKey('cases-filter-new'),
              icon: AppIcons.notificationsNoneRounded,
              label: t.t('tag.new'),
              subtitle: t.t('mine.listFilter.newHint'),
              selected: isNew,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('new'),
            ),
          AppListRow(
            key: const ValueKey('cases-filter-stages'),
            icon: AppIcons.gridViewRounded,
            label: t.t('mine.listFilter.stages'),
            trailingText: casesListStagesLabel(t, s.stages),
            onTap: () => Navigator.of(sheet).pop('stages'),
          ),
          AppListRow(
            key: const ValueKey('cases-filter-inWork'),
            icon: AppIcons.workOutlineRounded,
            label: t.t('cases.stage.2'),
            selected: inWork,
            showChevron: false,
            onTap: () => Navigator.of(sheet).pop('inWork'),
          ),
          if (!attorney) ...[
            AppListRow(
              key: const ValueKey('cases-filter-open'),
              icon: AppIcons.folderOpenRounded,
              label: t.t('mine.filter.open'),
              selected: isOpen,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('open'),
            ),
            AppListRow(
              key: const ValueKey('cases-filter-awaiting'),
              icon: AppIcons.hourglassTopRounded,
              label: t.t('mine.listFilter.awaiting'),
              subtitle: t.t('mine.listFilter.awaitingHint'),
              selected: s.awaiting,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('awaiting'),
            ),
          ],
          AppListRow(
            key: const ValueKey('cases-filter-date'),
            icon: AppIcons.scheduleRounded,
            label: t.t('tasks.field.date'),
            trailingText: sortLabel,
            onTap: () => Navigator.of(sheet).pop('date'),
          ),
          if (s.listFilterCount > 0)
            AppListRow(
              key: const ValueKey('cases-filter-reset'),
              icon: AppIcons.filterAltOffOutlined,
              label: t.t('tasks.filter.reset'),
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('reset'),
            ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    ),
  );
  if (!context.mounted || choice == null) return null;
  switch (choice) {
    case 'reset':
      return s.withoutListFilters;
    // A quick pick toggles: the same pick again turns it off.
    case 'new':
      return s.copyWith(stages: isNew ? const {} : const {0}, awaiting: false);
    case 'inWork':
      return s.copyWith(stages: inWork ? const {} : const {2}, awaiting: false);
    case 'open':
      return s.copyWith(
        stages: isOpen ? const {} : const {0, 1},
        awaiting: false,
      );
    case 'awaiting':
      return s.copyWith(awaiting: !s.awaiting, stages: const {});
    case 'stages':
      final picked = await OptionPickerSheet.show(
        context,
        title: t.t('mine.listFilter.stages'),
        multi: true,
        initial: {for (final st in s.stages) '$st'},
        options: [
          for (final st in casesListStages(attorney: attorney))
            PickerOption(
              value: '$st',
              label: t.t('mine.stage.short', {'n': '${st + 1}'}),
              sublabel: t.t('cases.stage.$st'),
            ),
        ],
      );
      if (picked == null) return null;
      return s.copyWith(
        stages: {for (final v in picked) int.parse(v)},
        awaiting: false,
      );
    case 'date':
      final picked = await OptionPickerSheet.show(
        context,
        title: t.t('tasks.field.date'),
        initial: {s.sort.name},
        options: [
          for (final sort in CasesSort.values)
            PickerOption(value: sort.name, label: sortLabelOf(t, sort)),
        ],
      );
      if (picked == null || picked.isEmpty) return null;
      return s.copyWith(
        sort: CasesSort.values.firstWhere((x) => x.name == picked.first),
      );
  }
  return null;
}
