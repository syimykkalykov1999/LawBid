import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// One selectable option.
class PickerOption {
  const PickerOption({
    required this.value,
    required this.label,
    this.sublabel,
    this.group,
    this.nested = false,
  });

  final String value;
  final String label;
  final String? sublabel;

  /// Owner 2026-09-30: the parent's name (a subcategory's category) —
  /// shown under the label in suggestions and matched by the search.
  final String? group;

  /// Shown indented under its parent when the list is not searched.
  final bool nested;
}

/// Owner 2026-09-30: suggestions while typing — options whose label
/// starts with the query (or a word of it) first, then the rest that
/// contain it; each word of the query must match.
List<PickerOption> suggestOptions(List<PickerOption> options, String query) {
  final words = query
      .trim()
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return options;
  int? score(PickerOption o) {
    final label = o.label.toLowerCase();
    final hay = '$label ${o.group?.toLowerCase() ?? ''} '
        '${o.value.toLowerCase()} ${o.sublabel?.toLowerCase() ?? ''}';
    if (!words.every(hay.contains)) return null;
    if (label.startsWith(words.first)) return 0;
    if (label
        .split(RegExp(r'[\s,/-]+'))
        .any((w) => w.startsWith(words.first))) {
      return 1;
    }
    return label.contains(words.first) ? 2 : 3;
  }

  final scored = <(int, int, PickerOption)>[];
  for (var i = 0; i < options.length; i++) {
    final s = score(options[i]);
    if (s != null) scored.add((s, i, options[i]));
  }
  scored.sort((a, b) => a.$1 != b.$1 ? a.$1 - b.$1 : a.$2 - b.$2);
  return [for (final s in scored) s.$3];
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
    this.searchHint,
    super.key,
  });

  /// "Start typing: arbitration, visa…" (owner 2026-09-30).
  final String? searchHint;

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
    String? searchHint,
  }) {
    return showAppBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => OptionPickerSheet(
        title: title,
        options: options,
        initial: initial,
        multi: multi,
        searchHint: searchHint,
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
    final filtered = suggestOptions(widget.options, q);

    // Owner 2026-09-29: draggable all the way to the top.
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.4,
      builder: (context, scrollController) => SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Semantics(
                header: true,
                child: Text(
                  widget.title,
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _search,
                hintText: widget.searchHint ?? t.t('common.search'),
                semanticLabel: widget.searchHint ?? t.t('common.search'),
                leading: AppIcon(
                  AppIcons.searchRounded,
                  size: AppSizes.iconSm,
                  color: colors.textSecondary,
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
              const SizedBox(height: AppSpacing.md),
              Expanded(
                child: filtered.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(AppSpacing.xl),
                        child: Text(
                          t.t('lang.picker.empty'),
                          textAlign: TextAlign.center,
                          style: typography.body
                              .copyWith(color: colors.textSecondary),
                        ),
                      )
                    : ListView.separated(
                        controller: scrollController,
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpacing.xs),
                        itemBuilder: (context, i) {
                          final o = filtered[i];
                          return AppListRow(
                            label: o.label,
                            // Searching: say where a subcategory belongs.
                            subtitle: q.isNotEmpty ? o.group : null,
                            indent: q.isEmpty && o.nested ? AppSpacing.lg : 0,
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
                  label: _selected.isEmpty
                      ? t.t('common.done')
                      : '${t.t('common.done')} · ${_selected.length}',
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
            child: Text(
              label,
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppPressable(
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.md,
              ),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.field),
                border:
                    Border.all(color: hasError ? colors.danger : colors.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: ExcludeSemantics(
                      child: Text(
                        value ?? placeholder,
                        style: typography.body.copyWith(
                          color: value == null
                              ? colors.textSecondary
                              : colors.text,
                        ),
                      ),
                    ),
                  ),
                  ChevronGlyph(
                    direction: ChevronDirection.down,
                    size: 15,
                    color: colors.textSecondary,
                  ),
                ],
              ),
            ),
          ),
          if (hasError) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              errorText!,
              style: typography.caption.copyWith(color: colors.danger),
            ),
          ],
        ],
      ),
    );
  }
}
