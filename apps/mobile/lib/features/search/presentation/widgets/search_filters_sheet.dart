import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart'
    show pickState, stateName;
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';

/// docs/05 §7.3 / §7.4 filters in a bottom sheet: practice and state for
/// both tabs; min rating and language for attorneys; period for cases.
Future<SearchFilters?> showSearchFilters(
  BuildContext context, {
  required SearchFilters initial,
  required bool forCases,
}) =>
    showAppBottomSheet<SearchFilters>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FiltersSheet(initial: initial, forCases: forCases),
    );

class _FiltersSheet extends ConsumerStatefulWidget {
  const _FiltersSheet({required this.initial, required this.forCases});

  final SearchFilters initial;
  final bool forCases;

  @override
  ConsumerState<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends ConsumerState<_FiltersSheet> {
  late String? _practiceId = widget.initial.practiceAreaId;
  late String? _practiceLabel = widget.initial.practiceLabel;
  late String? _state = widget.initial.state;
  late double? _minRating = widget.initial.minRating;
  late String? _language = widget.initial.language;
  late SearchPeriod _period = widget.initial.period;

  Future<void> _pickPractice() async {
    final t = ref.read(translatorProvider);
    final tree = await ref.read(practiceTreeProvider.future);
    if (!mounted) return;
    final labels = <String, String>{};
    final options = [
      for (final c in tree)
        for (final l in c.children)
          PickerOption(
            value: l.id,
            label: labels[l.id] = CaseFormat.practice(t, l.i18nKey, l.nameEn),
            sublabel: CaseFormat.practice(t, c.i18nKey, c.nameEn),
          ),
    ];
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('search.filter.practice'),
      options: options,
      initial: {if (_practiceId != null) _practiceId!},
    );
    if (picked == null || !mounted) return;
    setState(() {
      _practiceId = picked.isEmpty ? null : picked.first;
      _practiceLabel = _practiceId == null ? null : labels[_practiceId];
    });
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
      initial: {if (_language != null) _language!},
    );
    if (picked == null || !mounted) return;
    setState(() => _language = picked.isEmpty ? null : picked.first);
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

    Widget section(String title, Widget child) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: type.bodySmall.copyWith(
                      color: colors.textSecondary,
                      fontWeight: FontWeight.w600,),),
              const SizedBox(height: AppSpacing.sm),
              child,
            ],
          ),
        );

    Widget pickerChip(String label, bool selected, VoidCallback onTap) =>
        AppChip(
          label: label,
          selected: selected,
          trailing: const Icon(Icons.expand_more_rounded, size: AppSpacing.lg),
          onTap: onTap,
        );

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
            AppSpacing.md, AppSpacing.screenSide, AppSpacing.lg,),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Row(
              children: [
                Expanded(
                  child: Text(t.t('search.filters'),
                      style: type.titleMedium.copyWith(color: colors.text),),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    _practiceId = null;
                    _practiceLabel = null;
                    _state = null;
                    _minRating = null;
                    _language = null;
                    _period = SearchPeriod.all;
                  }),
                  child: Text(t.t('search.filter.reset')),
                ),
              ],
            ),
            section(
              t.t('search.filter.practice'),
              Align(
                alignment: Alignment.centerLeft,
                child: pickerChip(
                  _practiceLabel ?? t.t('search.filter.any'),
                  _practiceId != null,
                  _pickPractice,
                ),
              ),
            ),
            section(
              t.t('search.filter.state'),
              Align(
                alignment: Alignment.centerLeft,
                child: pickerChip(
                  _state == null ? t.t('search.filter.any') : stateName(_state!),
                  _state != null,
                  () async {
                    final code = await pickState(context, t);
                    if (code != null && mounted) setState(() => _state = code);
                  },
                ),
              ),
            ),
            if (!widget.forCases) ...[
              section(
                t.t('search.filter.minRating'),
                Wrap(
                  spacing: AppSpacing.sm,
                  children: [
                    for (final r in const <double?>[null, 3, 4, 4.5])
                      AppChip(
                        label: r == null
                            ? t.t('search.filter.any')
                            : '★ ${r.toStringAsFixed(r % 1 == 0 ? 0 : 1)}+',
                        selected: _minRating == r,
                        onTap: () => setState(() => _minRating = r),
                      ),
                  ],
                ),
              ),
              section(
                t.t('search.filter.language'),
                Align(
                  alignment: Alignment.centerLeft,
                  child: pickerChip(
                    _languageName(_language) ?? t.t('search.filter.any'),
                    _language != null,
                    _pickLanguage,
                  ),
                ),
              ),
            ] else
              section(
                t.t('search.filter.period'),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final p in SearchPeriod.values)
                      AppChip(
                        label: t.t('search.period.${p.name}'),
                        selected: _period == p,
                        onTap: () => setState(() => _period = p),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: AppSpacing.xl),
            AppButton(
              label: t.t('search.filter.apply'),
              onPressed: () => Navigator.of(context).pop(SearchFilters(
                practiceAreaId: _practiceId,
                practiceLabel: _practiceLabel,
                state: _state,
                minRating: widget.forCases ? null : _minRating,
                language: widget.forCases ? null : _language,
                period: widget.forCases ? _period : SearchPeriod.all,
              ),),
            ),
          ],
        ),
      ),
    );
  }
}
