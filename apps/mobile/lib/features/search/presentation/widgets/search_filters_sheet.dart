import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart'
    show pickState, stateName;
import 'package:lawbid/features/feed/presentation/widgets/topic_filter_bar.dart'
    show topicName;
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';

/// Owner 2026-09-30 (OQ-036): the filter sheet of the Search field shows
/// the filters of the open tab only — people, cases, the client's own
/// cases, posts or topics.
Future<SearchFilters?> showSearchFilters(
  BuildContext context, {
  required SearchFilters initial,
  required SearchFilterKind kind,
}) =>
    showAppBottomSheet<SearchFilters>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FiltersSheet(initial: initial, kind: kind),
    );

/// Budget ranges offered for cases (whole dollars; null = open end).
const _budgets = <(int?, int?)>[
  (null, null),
  (null, 500),
  (500, 2000),
  (2000, 5000),
  (5000, null),
];

class _FiltersSheet extends ConsumerStatefulWidget {
  const _FiltersSheet({required this.initial, required this.kind});

  final SearchFilters initial;
  final SearchFilterKind kind;

  @override
  ConsumerState<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends ConsumerState<_FiltersSheet> {
  late SearchFilters _f = widget.initial;

  SearchFilterKind get kind => widget.kind;

  void _set(SearchFilters Function(SearchFilters f) change) =>
      setState(() => _f = change(_f));

  /// A new filter set from the current one with some fields replaced.
  SearchFilters _with({
    Object? practiceAreaId = _keep,
    Object? practiceLabel = _keep,
    Object? state = _keep,
    Object? minRating = _keep,
    Object? language = _keep,
    SearchPeriod? period,
    Object? role = _keep,
    bool? verifiedOnly,
    Object? practiceCategory = _keep,
    Object? budgetMin = _keep,
    Object? budgetMax = _keep,
    bool? budgetUnknown,
    bool? noBids,
    Object? caseStatus = _keep,
    bool? withPhotos,
    PostSort? postSort,
    TopicKind? topicKind,
    TopicSort? topicSort,
  }) {
    T pick<T>(Object? v, T old) => identical(v, _keep) ? old : v as T;
    return SearchFilters(
      practiceAreaId: pick(practiceAreaId, _f.practiceAreaId),
      practiceLabel: pick(practiceLabel, _f.practiceLabel),
      state: pick(state, _f.state),
      minRating: pick(minRating, _f.minRating),
      language: pick(language, _f.language),
      period: period ?? _f.period,
      role: pick(role, _f.role),
      verifiedOnly: verifiedOnly ?? _f.verifiedOnly,
      practiceCategory: pick(practiceCategory, _f.practiceCategory),
      budgetMin: pick(budgetMin, _f.budgetMin),
      budgetMax: pick(budgetMax, _f.budgetMax),
      budgetUnknown: budgetUnknown ?? _f.budgetUnknown,
      noBids: noBids ?? _f.noBids,
      caseStatus: pick(caseStatus, _f.caseStatus),
      withPhotos: withPhotos ?? _f.withPhotos,
      postSort: postSort ?? _f.postSort,
      topicKind: topicKind ?? _f.topicKind,
      topicSort: topicSort ?? _f.topicSort,
    );
  }

  Future<void> _pickPracticeLeaf() async {
    final t = ref.read(translatorProvider);
    final tree = await ref.read(practiceTreeProvider.future);
    if (!mounted) return;
    final labels = <String, String>{};
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('search.filter.practice'),
      // Owner 2026-09-30: suggestions while typing.
      searchHint: t.t('practice.search.hint'),
      // Audit 2026-10-01: a category (the server includes its
      // subcategories) or one subcategory.
      options: [
        for (final c in tree) ...[
          PickerOption(
            value: c.id,
            label: labels[c.id] = CaseFormat.practice(t, c.i18nKey, c.nameEn),
          ),
          for (final l in c.children)
            PickerOption(
              value: l.id,
              label: labels[l.id] = CaseFormat.practice(t, l.i18nKey, l.nameEn),
              group: CaseFormat.practice(t, c.i18nKey, c.nameEn),
              nested: true,
            ),
        ],
      ],
      initial: {if (_f.practiceAreaId != null) _f.practiceAreaId!},
    );
    if (picked == null || !mounted) return;
    final id = picked.isEmpty ? null : picked.first;
    _set((_) => _with(practiceAreaId: id, practiceLabel: labels[id]));
  }

  Future<void> _pickCategory(String title) async {
    final picked = await OptionPickerSheet.show(
      context,
      title: title,
      searchHint: ref.read(translatorProvider).t('practice.search.hint'),
      // Audit 2026-10-01: every category and subcategory.
      options: practiceOptions(ref),
      initial: {if (_f.practiceCategory != null) _f.practiceCategory!},
    );
    if (picked == null || !mounted) return;
    _set((_) => _with(practiceCategory: picked.isEmpty ? null : picked.first));
  }

  Future<void> _pickLanguage() async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('search.filter.language'),
      options: [
        for (final l in kLanguageCatalog)
          PickerOption(
            value: l.code,
            label: l.nativeName,
            sublabel: l.englishName == l.nativeName ? null : l.englishName,
          ),
      ],
      initial: {if (_f.language != null) _f.language!},
    );
    if (picked == null || !mounted) return;
    _set((_) => _with(language: picked.isEmpty ? null : picked.first));
  }

  String? _languageName(String? code) {
    if (code == null) return null;
    for (final l in kLanguageCatalog) {
      if (l.code == code) return l.nativeName;
    }
    return code;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final any = t.t('search.filter.any');

    Widget section(String title, Widget child) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: type.bodySmall.copyWith(
                  color: colors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              child,
            ],
          ),
        );

    // ignore: avoid_positional_boolean_parameters
    Widget picker(String label, bool selected, VoidCallback onTap) => Align(
          alignment: Alignment.centerLeft,
          child: AppChip(
            label: label,
            selected: selected,
            trailing:
                const AppIcon(AppIcons.expandMoreRounded, size: AppSpacing.lg),
            onTap: onTap,
          ),
        );

    Widget choices<T>(List<(T, String)> items, T value, void Function(T) on) =>
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final (v, label) in items)
              AppChip(
                label: label,
                selected: value == v,
                onTap: () => on(v),
              ),
          ],
        );

    // ignore: avoid_positional_boolean_parameters
    Widget toggle(String label, bool value, void Function(bool) on) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.sm),
          child: Semantics(
            toggled: value,
            child: SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              value: value,
              activeTrackColor: colors.gold,
              title: Text(label, style: type.body.copyWith(color: colors.text)),
              onChanged: on,
            ),
          ),
        );

    Widget stateSection(String title) => section(
          title,
          Row(
            children: [
              Flexible(
                child: picker(
                  _f.state == null ? any : stateName(_f.state!),
                  _f.state != null,
                  () async {
                    final code = await pickState(context, t);
                    if (code != null && mounted) {
                      _set((_) => _with(state: code.isEmpty ? null : code));
                    }
                  },
                ),
              ),
              if (_f.state != null)
                TextButton(
                  onPressed: () => _set((_) => _with(state: null)),
                  child: Text(any),
                ),
            ],
          ),
        );

    Widget periodSection() => section(
          t.t('search.filter.period'),
          choices<SearchPeriod>(
            [
              for (final p in SearchPeriod.values)
                (p, t.t('search.period.${p.name}')),
            ],
            _f.period,
            (p) => _set((_) => _with(period: p)),
          ),
        );

    Widget categorySection(String title) => section(
          title,
          picker(
            _f.practiceCategory == null
                ? any
                : topicName(ref, _f.practiceCategory!),
            _f.practiceCategory != null,
            () => _pickCategory(title),
          ),
        );

    final sections = switch (kind) {
      SearchFilterKind.people => [
          section(
            t.t('search.filter.role'),
            choices<String?>(
              [
                (null, t.t('search.filter.role.all')),
                ('attorney', t.t('search.filter.role.attorney')),
                ('client', t.t('search.filter.role.client')),
              ],
              _f.role,
              // Audit 2026-10-01: clients have no practice / rating /
              // language — switching to clients clears those filters.
              (r) => _set(
                (_) => r == 'client'
                    ? _with(
                        role: r,
                        practiceAreaId: null,
                        practiceLabel: null,
                        minRating: null,
                        language: null,
                      )
                    : _with(role: r),
              ),
            ),
          ),
          stateSection(t.t('search.filter.state')),
          if (_f.role != 'client') ...[
            section(
              t.t('search.filter.practice'),
              picker(
                _f.practiceLabel ?? any,
                _f.practiceAreaId != null,
                _pickPracticeLeaf,
              ),
            ),
            section(
              t.t('search.filter.minRating'),
              choices<double?>(
                [
                  for (final r in const <double?>[null, 3, 4, 4.5])
                    (
                      r,
                      r == null
                          ? any
                          : '★ ${r.toStringAsFixed(r % 1 == 0 ? 0 : 1)}+'
                    ),
                ],
                _f.minRating,
                (r) => _set((_) => _with(minRating: r)),
              ),
            ),
            section(
              t.t('search.filter.language'),
              picker(
                _languageName(_f.language) ?? any,
                _f.language != null,
                _pickLanguage,
              ),
            ),
          ],
          toggle(
            t.t('search.filter.verifiedOnly'),
            _f.verifiedOnly,
            (v) => _set((_) => _with(verifiedOnly: v)),
          ),
        ],
      SearchFilterKind.cases => [
          categorySection(t.t('search.filter.practice')),
          stateSection(t.t('search.filter.state')),
          periodSection(),
          section(
            t.t('search.filter.budget'),
            choices<(int?, int?)>(
              [
                for (final b in _budgets) (b, _budgetLabel(t, b)),
              ],
              (_f.budgetMin, _f.budgetMax),
              (b) => _set((_) => _with(budgetMin: b.$1, budgetMax: b.$2)),
            ),
          ),
          toggle(
            t.t('search.filter.budgetUnknown'),
            _f.budgetUnknown,
            (v) => _set((_) => _with(budgetUnknown: v)),
          ),
          toggle(
            t.t('search.filter.noBids'),
            _f.noBids,
            (v) => _set((_) => _with(noBids: v)),
          ),
        ],
      SearchFilterKind.myCases => [
          section(
            t.t('search.filter.status'),
            choices<MyCasesFilter?>(
              [
                (null, any),
                for (final s in MyCasesFilter.values)
                  (s, t.t('search.filter.status.${s.name}')),
              ],
              _f.caseStatus,
              (s) => _set((_) => _with(caseStatus: s)),
            ),
          ),
          categorySection(t.t('search.filter.practice')),
        ],
      SearchFilterKind.posts => [
          categorySection(t.t('search.filter.topic')),
          stateSection(t.t('search.filter.authorState')),
          periodSection(),
          section(
            t.t('search.filter.sort'),
            choices<PostSort>(
              [
                for (final s in PostSort.values)
                  (s, t.t('search.sort.${s.name}')),
              ],
              _f.postSort,
              (s) => _set((_) => _with(postSort: s)),
            ),
          ),
          toggle(
            t.t('search.filter.withPhotos'),
            _f.withPhotos,
            (v) => _set((_) => _with(withPhotos: v)),
          ),
        ],
      SearchFilterKind.topics => [
          section(
            t.t('search.filter.topicKind'),
            choices<TopicKind>(
              [
                for (final k in TopicKind.values)
                  (k, t.t('search.topicKind.${k.name}')),
              ],
              _f.topicKind,
              (k) => _set((_) => _with(topicKind: k)),
            ),
          ),
          section(
            t.t('search.filter.sort'),
            choices<TopicSort>(
              [
                for (final s in TopicSort.values)
                  (s, t.t('search.topicSort.${s.name}')),
              ],
              _f.topicSort,
              (s) => _set((_) => _with(topicSort: s)),
            ),
          ),
        ],
    };

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      t.t('search.filters.${kind.name}'),
                      style: type.titleMedium.copyWith(color: colors.text),
                    ),
                  ),
                  TextButton(
                    onPressed: () => setState(() => _f = const SearchFilters()),
                    child: Text(t.t('search.filter.reset')),
                  ),
                ],
              ),
              ...sections,
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: t.t('search.filter.apply'),
                onPressed: () => Navigator.of(context).pop(_f),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _budgetLabel(Translator t, (int?, int?) b) => switch (b) {
        (null, null) => t.t('search.filter.any'),
        (null, final int hi) => '< \$$hi',
        (final int lo, null) => '\$$lo+',
        (final int lo, final int hi) => '\$$lo–\$$hi',
      };
}

const Object _keep = Object();
