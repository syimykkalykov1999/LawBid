import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';

/// Owner 2026-10-20: the questions' filters live behind the button inside
/// the search field. Returns the chosen [QuestionsQuery] (the search text is
/// kept), or null when the sheet is dismissed.
Future<QuestionsQuery?> showQaFilterSheet(
  BuildContext context, {
  required QuestionsQuery current,
  required bool attorney,
}) =>
    showAppBottomSheet<QuestionsQuery>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _QaFilterSheet(current: current, attorney: attorney),
    );

class _QaFilterSheet extends ConsumerStatefulWidget {
  const _QaFilterSheet({required this.current, required this.attorney});

  final QuestionsQuery current;
  final bool attorney;

  @override
  ConsumerState<_QaFilterSheet> createState() => _QaFilterSheetState();
}

class _QaFilterSheetState extends ConsumerState<_QaFilterSheet> {
  late QuestionsQuery _q = widget.current;

  Future<void> _pickArea() async {
    final t = ref.read(translatorProvider);
    final r = await pickQaArea(
      context,
      ref,
      title: t.t('qa.area'),
      current: _q.practiceAreaId,
    );
    if (r == null || !mounted) return;
    setState(
      () => _q = r.id.isEmpty
          ? _q.copyWith(clearPractice: true)
          : _q.copyWith(practiceAreaId: r.id, practiceLabel: r.label),
    );
  }

  Future<void> _pickState() async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('qa.state'),
      options: [
        for (final s in kRegions)
          PickerOption(value: s.code, label: s.name, sublabel: s.code),
      ],
      initial: {if (_q.stateCode != null) _q.stateCode!},
    );
    if (picked == null || !mounted) return;
    setState(
      () => _q = picked.isEmpty
          ? _q.copyWith(clearState: true)
          : _q.copyWith(stateCode: picked.first),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget picker(String label, VoidCallback onTap, {required bool selected}) =>
        AppChip(
          label: label,
          expand: true,
          selected: selected,
          trailing: AppIcon(
            AppIcons.expandMoreRounded,
            size: 18,
            color: colors.textSecondary,
          ),
          onTap: onTap,
        );
    final height = MediaQuery.sizeOf(context).height;
    // Owner 2026-10-24: same raised, roomy sheet as every «Мои» picker —
    // handle, padded title row, 30–60% of the screen.
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          minHeight: height * 0.3,
          maxHeight: height * 0.6,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.xs,
                AppSpacing.screenSide,
                AppSpacing.md,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      t.t('search.filters'),
                      style: type.titleMedium.copyWith(color: colors.text),
                    ),
                  ),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 160),
                    child: TextButton(
                      onPressed: () => setState(
                        () => _q = _q.copyWith(
                          clearPractice: true,
                          clearState: true,
                        ),
                      ),
                      child: Text(
                        t.t('search.filter.reset'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  0,
                  AppSpacing.screenSide,
                  AppSpacing.lg,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    picker(
                      _q.practiceLabel ?? t.t('qa.allAreas'),
                      _pickArea,
                      selected: _q.practiceAreaId != null,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    picker(
                      _q.stateCode ?? t.t('qa.allStates'),
                      _pickState,
                      selected: _q.stateCode != null,
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    AppButton(
                      label: t.t('search.filter.apply'),
                      onPressed: () => Navigator.of(context).pop(_q),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
