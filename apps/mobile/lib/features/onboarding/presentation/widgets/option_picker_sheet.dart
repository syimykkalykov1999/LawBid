import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// One selectable option.
class PickerOption {
  const PickerOption({
    required this.value,
    required this.label,
    this.sublabel,
    this.group,
    this.nested = false,
    this.exclusive = false,
  });

  final String value;
  final String label;
  final String? sublabel;

  /// Owner 2026-09-30: the parent's name (a subcategory's category) —
  /// shown under the label in suggestions and matched by the search.
  final String? group;

  /// Owner 2026-10-05: a subcategory — kept inside its parent's
  /// collapsible group when the list is not searched.
  final bool nested;

  /// Owner 2026-10-06: on a group head — its nested options are one choice
  /// (exactly one stays picked, no "Select all"), e.g. «Юр. посты»: «Все
  /// юр. посты» or «Только мои темы». The head itself is never picked.
  final bool exclusive;
}

/// Owner 2026-10-05: an option followed by its nested options — one
/// collapsible group, like the qualification editor. `children` is empty
/// for a plain row ("News", "Any").
typedef PickerGroup = ({PickerOption head, List<PickerOption> children});

/// Groups [options] in order: each nested option joins the option above.
List<PickerGroup> groupOptions(List<PickerOption> options) {
  final groups = <PickerGroup>[];
  for (final o in options) {
    if (o.nested && groups.isNotEmpty) {
      groups.last.children.add(o);
    } else {
      groups.add((head: o, children: <PickerOption>[]));
    }
  }
  return groups;
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
    this.back = false,
    this.remoteSearch,
    this.unknownLabel,
    this.confirm = false,
    super.key,
  });

  /// Owner 2026-10-15: asks the server which options a word in ANY language
  /// names (value → the matching word); they join the local matches.
  final Future<Map<String, String?>> Function(String query)? remoteSearch;

  /// «Не знаю тему» under the search: returns `{''}` (no choice).
  final String? unknownLabel;

  /// One choice that stays on screen (a tick on its row) until the pinned
  /// «Готово»; the sheet then closes only by its handle.
  final bool confirm;

  /// Owner 2026-10-12: a picker opened from a menu (feed filters) has a
  /// back arrow on the left and a centred title; arrow and system Back
  /// both return [backResult] instead of closing everything.
  final bool back;

  /// What a picker with [back] returns when the user steps back.
  static final Set<String> backResult = <String>{};

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
    bool back = false,
    Future<Map<String, String?>> Function(String query)? remoteSearch,
    String? unknownLabel,
    bool confirm = false,
  }) {
    return showAppBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      closeByHandleOnly: confirm,
      builder: (_) => OptionPickerSheet(
        remoteSearch: remoteSearch,
        unknownLabel: unknownLabel,
        confirm: confirm,
        title: title,
        options: options,
        initial: initial,
        multi: multi,
        searchHint: searchHint,
        back: back,
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
  final Set<String> _expanded = {};
  final _keyboardScroll = ScrollController();
  Map<String, String?> _remote = const {};
  Timer? _debounce;

  void _onQuery(String v) {
    setState(() => _query = v);
    final search = widget.remoteSearch;
    if (search == null) return;
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() => _remote = const {});
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      final r = await search(v.trim());
      if (mounted && _query == v) setState(() => _remote = r);
    });
  }

  /// Owner 2026-10-15: leaving a confirm-picker by the handle or a tap
  /// outside keeps the choice already made (no dialog, nothing is lost).
  void _close() =>
      Navigator.of(context).pop(_selected.isEmpty ? null : {..._selected});

  /// One-of choices (an [PickerOption.exclusive] head's options) → their
  /// siblings.
  late final Map<String, Set<String>> _oneOf = {
    for (final g in groupOptions(widget.options))
      if (g.head.exclusive)
        for (final o in g.children)
          o.value: {for (final c in g.children) c.value},
  };

  @override
  void dispose() {
    // The keyboard goes with the sheet (it used to hang over the page).
    FocusManager.instance.primaryFocus?.unfocus();
    _debounce?.cancel();
    _keyboardScroll.dispose();
    _search.dispose();
    super.dispose();
  }

  /// A subcategory → its category's value (for «Select all» semantics).
  late final Map<String, PickerOption> _headOf = {
    for (final g in groupOptions(widget.options))
      if (!g.head.exclusive)
        for (final o in g.children) o.value: g.head,
  };

  /// Children of [head] by head value.
  List<PickerOption> _childrenOf(String head) => [
        for (final g in groupOptions(widget.options))
          if (g.head.value == head) ...g.children,
      ];

  void _toggle(String value) {
    // Owner 2026-10-15: with a whole category picked, every row of it shows
    // ticked; unticking one row keeps the others.
    final head = _headOf[value];
    if (head != null && _selected.contains(head.value) && !widget.confirm) {
      setState(() {
        _selected
          ..remove(head.value)
          ..addAll(
            _childrenOf(head.value)
                .map((o) => o.value)
                .where((v) => v != value),
          );
      });
      return;
    }
    if (widget.confirm) {
      setState(() {
        if (!_selected.remove(value)) {
          _selected
            ..clear()
            ..add(value);
        }
      });
      return;
    }
    if (!widget.multi) {
      Navigator.of(context).pop({value});
      return;
    }
    setState(() {
      final siblings = _oneOf[value];
      if (siblings != null) {
        // One of them always stays picked.
        _selected
          ..removeAll(siblings)
          ..add(value);
        return;
      }
      if (!_selected.remove(value)) _selected.add(value);
    });
  }

  int get _counted => _selected.where((v) => !_oneOf.containsKey(v)).length;

  /// Owner 2026-10-05: not searching — categories as collapsible cards
  /// (tap to open, pick what is needed), like the qualification editor.
  Widget _groupedList(ScrollController controller, Translator t) {
    final groups = groupOptions(widget.options);
    return ListView.separated(
      controller: controller,
      itemCount: groups.length,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
      itemBuilder: (context, i) {
        final g = groups[i];
        if (g.children.isEmpty) {
          return AppListRow(
            label: g.head.label,
            trailingText: g.head.sublabel,
            selected: _selected.contains(g.head.value),
            showChevron: false,
            onTap: () => _toggle(g.head.value),
          );
        }
        return _PickerGroupCard(
          key: ValueKey('picker-group-${g.head.value}'),
          group: g,
          selected: _selected,
          expanded: _expanded.contains(g.head.value),
          onExpand: () => setState(() {
            if (!_expanded.remove(g.head.value)) _expanded.add(g.head.value);
          }),
          onToggle: _toggle,
          t: t,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final q = _query.trim().toLowerCase();
    final local = suggestOptions(widget.options, q);
    // Any-language matches the label search missed join the list.
    final have = {for (final o in local) o.value};
    final filtered = [
      ...local,
      if (q.isNotEmpty)
        for (final o in widget.options)
          if (!have.contains(o.value) &&
              (_remote.containsKey(o.value) ||
                  (o.nested &&
                      _remote.keys.any(
                        (k) => !k.contains('.') && o.value.startsWith('$k.'),
                      ))))
            o,
    ];

    // Owner 2026-09-29: draggable all the way to the top.
    Widget content(BuildContext context, ScrollController scrollController) =>
        SafeArea(
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
                if (widget.confirm)
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _close,
                    onVerticalDragEnd: (d) {
                      if ((d.primaryVelocity ?? 0) > 100) _close();
                    },
                    child: const Padding(
                      padding: EdgeInsets.only(top: AppSpacing.sm),
                      child: AppSheetHandle(),
                    ),
                  )
                else
                  const AppSheetHandle(),
                Semantics(
                  header: true,
                  child: widget.back
                      ? Row(
                          children: [
                            AppBackButton(
                              semanticLabel: t.t('common.back'),
                              onPressed: () => Navigator.of(context)
                                  .pop(OptionPickerSheet.backResult),
                            ),
                            Expanded(
                              child: Text(
                                widget.title,
                                textAlign: TextAlign.center,
                                style: typography.titleMedium
                                    .copyWith(color: colors.text),
                              ),
                            ),
                            // Balances the back button so the title is centred.
                            const SizedBox(width: AppSizes.touchTarget),
                          ],
                        )
                      : Text(
                          widget.title,
                          style: typography.titleMedium
                              .copyWith(color: colors.text),
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
                  onChanged: _onQuery,
                ),
                // Hidden while typing (the keyboard needs the room).
                if (widget.unknownLabel != null &&
                    q.isEmpty &&
                    MediaQuery.viewInsetsOf(context).bottom == 0) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppButton(
                    label: widget.unknownLabel!,
                    variant: AppButtonVariant.secondary,
                    onPressed: () => Navigator.of(context).pop({''}),
                  ),
                ],
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
                      : q.isEmpty && widget.options.any((o) => o.nested)
                          ? _groupedList(scrollController, t)
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
                                  subtitle: q.isNotEmpty
                                      ? (_remote[o.value] ?? o.group)
                                      : null,
                                  trailingText: o.sublabel,
                                  selected: _selected.contains(o.value),
                                  showChevron: false,
                                  onTap: () => _toggle(o.value),
                                );
                              },
                            ),
                ),
                if (widget.multi || widget.confirm) ...[
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    // A one-of choice is a setting, not a pick: not counted.
                    label: widget.confirm || _counted == 0
                        ? t.t('common.done')
                        : '${t.t('common.done')} · $_counted',
                    onPressed: widget.confirm && _selected.isEmpty
                        ? null
                        : () => Navigator.of(context).pop(_selected),
                  ),
                ],
              ],
            ),
          ),
        );
    // Owner 2026-10-15: with the keyboard open the sheet takes the screen
    // below the status bar (the keyboard's room is padded inside), so the
    // search, the list and «Готово» never overflow.
    final media = MediaQuery.of(context);
    // ignore: omit_local_variable_types
    final Widget sheet = media.viewInsets.bottom > 0
        ? SizedBox(
            height: media.size.height - media.padding.top - AppSpacing.sm,
            child: content(context, _keyboardScroll),
          )
        : DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.7,
            minChildSize: 0.4,
            builder: content,
          );
    if (widget.confirm) {
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _close();
        },
        child: sheet,
      );
    }
    if (!widget.back) return sheet;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(OptionPickerSheet.backResult);
      },
      child: sheet,
    );
  }
}

class _PickerGroupCard extends StatelessWidget {
  const _PickerGroupCard({
    required this.group,
    required this.selected,
    required this.expanded,
    required this.onExpand,
    required this.onToggle,
    required this.t,
    super.key,
  });

  final PickerGroup group;
  final Set<String> selected;
  final bool expanded;
  final VoidCallback onExpand;
  final ValueChanged<String> onToggle;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final reduce = context.reduceMotion;
    final head = group.head;
    final headPicked = selected.contains(head.value);
    // A one-of choice shows what is chosen instead of a count.
    final choice = head.exclusive
        ? group.children.where((o) => selected.contains(o.value)).firstOrNull
        : null;
    // Whole category picked = all its rows count (owner 2026-10-15).
    final picked = head.exclusive
        ? 0
        : headPicked
            ? group.children.length
            : group.children.where((o) => selected.contains(o.value)).length;

    return AnimatedContainer(
      duration: reduce ? Duration.zero : AppMotion.stateChange,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(
          color:
              picked > 0 || choice != null ? colors.goldStroke : colors.border,
        ),
      ),
      child: Column(
        children: [
          Semantics(
            button: true,
            expanded: expanded,
            label: choice != null
                ? '${head.label}. ${choice.label}'
                : picked > 0
                    ? '${head.label}. '
                        '${t.t('practices.pickedCount', {'count': '$picked'})}'
                    : head.label,
            excludeSemantics: true,
            onTap: onExpand,
            child: InkWell(
              borderRadius: BorderRadius.circular(AppRadii.card),
              onTap: onExpand,
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  minHeight: AppSizes.hitTarget + AppSpacing.sm,
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                    vertical: AppSpacing.sm,
                  ),
                  child: Row(
                    children: [
                      // Long names wrap; the badge and chevron stay put.
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              head.label,
                              style: typography.roleTitle
                                  .copyWith(color: colors.text),
                            ),
                            if (choice != null)
                              Text(
                                choice.label,
                                style: typography.bodySmall
                                    .copyWith(color: colors.goldStroke),
                              ),
                          ],
                        ),
                      ),
                      if (picked > 0)
                        Container(
                          margin: const EdgeInsetsDirectional.only(
                            start: AppSpacing.sm,
                            end: AppSpacing.sm,
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.sm,
                            vertical: AppSpacing.xs / 2,
                          ),
                          decoration: BoxDecoration(
                            color: colors.gold,
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                          child: Text(
                            context.digits(picked),
                            style:
                                typography.badge.copyWith(color: colors.navy),
                          ),
                        ),
                      AnimatedRotation(
                        turns: expanded ? 0.5 : 0,
                        duration:
                            reduce ? Duration.zero : AppMotion.stateChange,
                        child: AppIcon(
                          AppIcons.expandMoreRounded,
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: reduce ? Duration.zero : AppMotion.stateChange,
            curve: AppMotion.enterCurve,
            alignment: Alignment.topCenter,
            child: !expanded
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.sm,
                      0,
                      AppSpacing.sm,
                      AppSpacing.sm,
                    ),
                    child: Column(
                      children: [
                        Divider(height: 1, color: colors.border),
                        // The category itself: everything in it (not for
                        // a one-of choice).
                        if (!head.exclusive)
                          PickerCheckRow(
                            key: ValueKey('picker-all-${head.value}'),
                            label: t.t('practices.selectAll'),
                            checked: headPicked,
                            emphasized: true,
                            onTap: () => onToggle(head.value),
                          ),
                        for (final o in group.children)
                          PickerCheckRow(
                            key: ValueKey('picker-option-${o.value}'),
                            label: o.label,
                            checked: headPicked && !head.exclusive ||
                                selected.contains(o.value),
                            onTap: () => onToggle(o.value),
                          ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// A row with a checkbox (the qualification editor and grouped pickers).
class PickerCheckRow extends StatelessWidget {
  const PickerCheckRow({
    required this.label,
    required this.checked,
    required this.onTap,
    super.key,
    this.emphasized = false,
  });

  final String label;
  final bool checked;
  final VoidCallback onTap;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final reduce = context.reduceMotion;
    return Semantics(
      checked: checked,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.field),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: Row(
              children: [
                AnimatedContainer(
                  duration: reduce ? Duration.zero : AppMotion.stateChange,
                  width: AppSizes.iconMd - 2,
                  height: AppSizes.iconMd - 2,
                  decoration: BoxDecoration(
                    color: checked ? colors.accent : colors.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.xs + 2),
                    border: Border.all(
                      color: checked ? colors.accent : colors.textSecondary,
                      width: 1.5,
                    ),
                  ),
                  child: checked
                      ? AppIcon(
                          AppIcons.checkRounded,
                          size: AppSpacing.lg,
                          color: colors.onAccent,
                        )
                      : null,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    label,
                    style: (emphasized ? typography.button : typography.body)
                        .copyWith(
                      color: emphasized ? colors.goldStroke : colors.text,
                    ),
                  ),
                ),
              ],
            ),
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
