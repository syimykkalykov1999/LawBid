import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// One selectable option.
class PickerOption {
  const PickerOption({required this.value, required this.label, this.sublabel});

  final String value;
  final String label;
  final String? sublabel;
}

/// Searchable single/multi-select bottom sheet (US states, languages) —
/// same visual language as LanguagePickerSheet/theme picker: sheet handle,
/// serif title, search field, [AppListRow]s with a gold check.
class OptionPickerSheet extends ConsumerStatefulWidget {
  const OptionPickerSheet({
    required this.title,
    required this.options,
    required this.initial,
    required this.multi,
    super.key,
  });

  final String title;
  final List<PickerOption> options;
  final Set<String> initial;
  final bool multi;

  /// Returns the new selection, or null when dismissed.
  static Future<Set<String>?> show(
    BuildContext context, {
    required String title,
    required List<PickerOption> options,
    required Set<String> initial,
    bool multi = false,
  }) {
    return showAppBottomSheet<Set<String>>(
      context: context,
      builder: (_) => OptionPickerSheet(
        title: title,
        options: options,
        initial: initial,
        multi: multi,
      ),
    );
  }

  @override
  ConsumerState<OptionPickerSheet> createState() => _OptionPickerSheetState();
}

class _OptionPickerSheetState extends ConsumerState<OptionPickerSheet> {
  late final Set<String> _selected = {...widget.initial};
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _toggle(String value) {
    if (!widget.multi) {
      Navigator.of(context).pop({value});
      return;
    }
    setState(() {
      if (!_selected.remove(value)) _selected.add(value);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? widget.options
        : widget.options
            .where((o) =>
                o.label.toLowerCase().contains(q) ||
                o.value.toLowerCase().contains(q) ||
                (o.sublabel?.toLowerCase().contains(q) ?? false))
            .toList();

    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Semantics(
                header: true,
                child: Text(widget.title, style: typography.titleMedium.copyWith(color: colors.text)),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _search,
                hintText: t.t('common.search'),
                semanticLabel: t.t('common.search'),
                leading: Icon(Icons.search_rounded, size: AppSizes.iconSm, color: colors.textSecondary),
                onChanged: (v) => setState(() => _query = v),
              ),
              const SizedBox(height: AppSpacing.md),
              Flexible(
                child: filtered.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(AppSpacing.xl),
                        child: Text(
                          t.t('lang.picker.empty'),
                          textAlign: TextAlign.center,
                          style: typography.body.copyWith(color: colors.textSecondary),
                        ),
                      )
                    : ListView.separated(
                        shrinkWrap: true,
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.xs),
                        itemBuilder: (context, i) {
                          final o = filtered[i];
                          return AppListRow(
                            label: o.label,
                            trailingText: o.sublabel,
                            selected: _selected.contains(o.value),
                            showChevron: false,
                            onTap: () => _toggle(o.value),
                          );
                        },
                      ),
              ),
              if (widget.multi) ...[
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: t.t('common.done'),
                  onPressed: () => Navigator.of(context).pop(_selected),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Tappable "field" that opens a picker and shows the current selection
/// (visible label above, like AppTextField).
class PickerField extends StatelessWidget {
  const PickerField({
    required this.label,
    required this.placeholder,
    required this.onTap,
    super.key,
    this.value,
    this.errorText,
  });

  final String label;
  final String placeholder;
  final String? value;
  final String? errorText;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final hasError = errorText != null;
    return Semantics(
      button: true,
      label: label,
      value: value,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Text(label, style: typography.bodySmall.copyWith(color: colors.textSecondary)),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppPressable(
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.md),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.field),
                border: Border.all(color: hasError ? colors.danger : colors.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: ExcludeSemantics(
                      child: Text(
                        value ?? placeholder,
                        style: typography.body.copyWith(
                          color: value == null ? colors.textSecondary : colors.text,
                        ),
                      ),
                    ),
                  ),
                  ChevronGlyph(direction: ChevronDirection.down, size: 15, color: colors.textSecondary),
                ],
              ),
            ),
          ),
          if (hasError) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(errorText!, style: typography.caption.copyWith(color: colors.danger)),
          ],
        ],
      ),
    );
  }
}
