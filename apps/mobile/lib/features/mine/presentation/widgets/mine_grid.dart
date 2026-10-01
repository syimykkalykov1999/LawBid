import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart'
    show CountPill;
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/features/search/presentation/widgets/flip_search_bar.dart';

/// Owner 2026-09-30: one square of the "Mine" grid — the case's first photo
/// (or our art of its qualification), a short title and its status.
class MineTileData {
  const MineTileData({
    required this.title,
    required this.statusLabel,
    required this.statusTone,
    required this.onTap,
    this.coverUrl,
    this.practiceCode,
    this.categoryCode,
    this.badge,
  });

  final String title;
  final String statusLabel;
  final StatusTone statusTone;
  final VoidCallback onTap;
  final String? coverUrl;
  final String? practiceCode;
  final String? categoryCode;

  /// A small count in the corner (e.g. unseen bids).
  final int? badge;
}

class MineTile extends StatelessWidget {
  const MineTile({required this.data, super.key});

  final MineTileData data;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final category = data.categoryCode ??
        (data.practiceCode == null
            ? null
            : practiceCategoryOf(data.practiceCode!));
    final Widget art = PracticePhoto(
      categoryCode: category,
      practiceCode: data.practiceCode,
    );
    final dot = switch (data.statusTone) {
      StatusTone.gold => colors.gold,
      StatusTone.info => colors.info,
      StatusTone.success => colors.success,
      StatusTone.warning => colors.warning,
      StatusTone.danger => colors.danger,
      StatusTone.neutral => colors.textSecondary,
    };
    return Semantics(
      button: true,
      label: '${data.title}, ${data.statusLabel}',
      excludeSemantics: true,
      child: AppPressable(
        onTap: data.onTap,
        child: ClipRect(
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (data.coverUrl != null)
                Image.network(
                  data.coverUrl!,
                  fit: BoxFit.cover,
                  cacheWidth: 360,
                  errorBuilder: (_, __, ___) => art,
                )
              else
                art,
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0.35, 1],
                    colors: [Color(0x00000000), Color(0xCC0A1A3F)],
                  ),
                ),
              ),
              Positioned(
                left: 6,
                top: 6,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xB30A1A3F),
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration:
                            BoxDecoration(color: dot, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 4),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 84),
                        child: Text(
                          data.statusLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(
                              color: Colors.white, fontSize: 10, height: 1.2),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if ((data.badge ?? 0) > 0)
                Positioned(
                  right: 6,
                  top: 6,
                  child: CountPill(count: data.badge!),
                ),
              Positioned(
                left: 6,
                right: 6,
                bottom: 6,
                child: Text(
                  data.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A paged 3-column grid with pull-to-refresh, loading, error, empty and
/// "load more" near the end.
class MinePagedGrid<T> extends ConsumerWidget {
  const MinePagedGrid({
    required this.value,
    required this.tileOf,
    required this.empty,
    required this.onRefresh,
    required this.onLoadMore,
    required this.onRetryMore,
    this.header,
    super.key,
  });

  final AsyncValue<PaginatedList<T>> value;
  final MineTileData Function(T item) tileOf;
  final Widget empty;
  final Future<void> Function() onRefresh;
  final VoidCallback onLoadMore;
  final VoidCallback onRetryMore;
  final Widget? header;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;

    Future<void> pull() async {
      try {
        await onRefresh();
      } on Object catch (error) {
        if (context.mounted) showAppSnackBar(context, errorText(t, error));
      }
    }

    final Widget body = switch (value) {
      AsyncData(:final value) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.surface,
          onRefresh: pull,
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (n.metrics.extentAfter < 600 && value.canLoadMore) {
                onLoadMore();
              }
              return false;
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                if (header != null) SliverToBoxAdapter(child: header),
                if (value.items.isEmpty && !value.hasMore)
                  SliverFillRemaining(child: empty)
                else
                  SliverPadding(
                    padding: const EdgeInsets.all(2),
                    sliver: SliverGrid.builder(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 2,
                        crossAxisSpacing: 2,
                      ),
                      itemCount: value.items.length,
                      itemBuilder: (context, i) =>
                          MineTile(data: tileOf(value.items[i])),
                    ),
                  ),
                if (value.isLoadingMore)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.lg),
                      child: Center(
                        child: SizedBox.square(
                          dimension: 24,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                  )
                else if (value.loadMoreError != null)
                  SliverToBoxAdapter(
                    child: Center(
                      child: TextButton(
                        onPressed: onRetryMore,
                        child: Text(t.t('error.retry')),
                      ),
                    ),
                  )
                else if (!value.hasMore && value.items.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      child: Text(
                        t.t('pagination.end'),
                        textAlign: TextAlign.center,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(
                    child: SizedBox(height: AppSpacing.xxl)),
              ],
            ),
          ),
        ),
      AsyncError(:final error) => CasesErrorView(
          error: error,
          t: t,
          onRetry: pull,
        ),
      _ => GridView.count(
          crossAxisCount: 3,
          padding: const EdgeInsets.all(2),
          mainAxisSpacing: 2,
          crossAxisSpacing: 2,
          children: List.generate(9, (_) => const AppSkeleton(borderRadius: 0)),
        ),
    };
    return AnimatedSwitcher(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      child: KeyedSubtree(key: ValueKey(value.runtimeType), child: body),
    );
  }
}

/// Owner 2026-09-30: search by title (suggestions as you type are the
/// results themselves) and a filter button — qualification (every category
/// and subcategory, searchable) and state.
class MineSearchBar extends ConsumerStatefulWidget {
  const MineSearchBar({
    required this.search,
    required this.onChanged,
    super.key,
  });

  final MineSearch search;
  final ValueChanged<MineSearch> onChanged;

  @override
  ConsumerState<MineSearchBar> createState() => _MineSearchBarState();
}

class _MineSearchBarState extends ConsumerState<MineSearchBar> {
  late final _text = TextEditingController(text: widget.search.q)
    ..addListener(_onText);
  final _focus = FocusNode();
  Timer? _debounce;
  late String _last = widget.search.q;

  @override
  void dispose() {
    _debounce?.cancel();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onText() {
    if (_text.text == _last) return;
    _last = _text.text;
    _typed(_text.text);
  }

  void _typed(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) widget.onChanged(widget.search.copyWith(q: v));
    });
  }

  Future<void> _filters() async {
    final t = ref.read(translatorProvider);
    final s = widget.search;
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            AppListRow(
              icon: Icons.grid_view_rounded,
              label: t.t('mine.search.practice'),
              trailingText: s.practice == null
                  ? t.t('mine.search.any')
                  : practiceLabel(ref, s.practice!),
              onTap: () => Navigator.of(sheet).pop('practice'),
            ),
            AppListRow(
              icon: Icons.map_outlined,
              label: t.t('mine.search.state'),
              trailingText: s.state ?? t.t('mine.search.any'),
              onTap: () => Navigator.of(sheet).pop('state'),
            ),
            if (s.filterCount > 0)
              AppListRow(
                icon: Icons.filter_alt_off_outlined,
                label: t.t('mine.search.clear'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop('clear'),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    if (choice == 'clear') {
      widget.onChanged(s.copyWith(practice: () => null, state: () => null));
      return;
    }
    if (choice == 'practice') {
      final picked = await OptionPickerSheet.show(
        context,
        title: t.t('mine.search.practice'),
        searchHint: t.t('practice.search.hint'),
        initial: {if (s.practice != null) s.practice!},
        options: [
          PickerOption(value: '', label: t.t('mine.search.any')),
          ...practiceOptions(ref),
        ],
      );
      if (picked == null) return;
      final v = picked.isEmpty ? '' : picked.first;
      widget.onChanged(s.copyWith(practice: () => v.isEmpty ? null : v));
      return;
    }
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('mine.search.state'),
      searchHint: t.t('state.search.hint'),
      initial: {if (s.state != null) s.state!},
      options: [
        PickerOption(value: '', label: t.t('mine.search.any')),
        for (final st in kUsStates)
          PickerOption(value: st.code, label: st.name, sublabel: st.code),
      ],
    );
    if (picked == null) return;
    final v = picked.isEmpty ? '' : picked.first;
    widget.onChanged(s.copyWith(state: () => v.isEmpty ? null : v));
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final count = widget.search.filterCount;
    // Owner 2026-09-30: like Search — the filter button inside the field
    // on the left, the magnifier on the right.
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, 0),
      child: FlipSearchBar(
        key: const ValueKey('mine-search'),
        controller: _text,
        focusNode: _focus,
        semanticLabel: t.t('mine.search.hint'),
        cancelLabel: t.t('common.cancel'),
        clearLabel: t.t('search.clear'),
        showCancel: false,
        height: AppSizes.searchField,
        hints: [t.t('mine.search.hint')],
        leading: Badge(
          isLabelVisible: count > 0,
          label: Text('$count'),
          backgroundColor: colors.gold,
          textColor: colors.navy,
          child: AppIconButton(
            key: const ValueKey('mine-filters'),
            plain: true,
            icon: Icon(Icons.tune_rounded, color: colors.text),
            semanticLabel: t.t('mine.search.filters'),
            onPressed: _filters,
          ),
        ),
        trailing: AppIconButton(
          plain: true,
          icon: Icon(Icons.search_rounded, color: colors.goldDark),
          semanticLabel: t.t('mine.search.hint'),
          onPressed: () => _focus.requestFocus(),
        ),
      ),
    );
  }
}

/// Chips of the active filters under the search bar (tap ✕ to drop one).
class MineActiveFilters extends ConsumerWidget {
  const MineActiveFilters({
    required this.search,
    required this.onChanged,
    super.key,
  });

  final MineSearch search;
  final ValueChanged<MineSearch> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (search.filterCount == 0) return const SizedBox.shrink();
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget chip(String label, VoidCallback onRemove) => AppPressable(
          onTap: onRemove,
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md, vertical: AppSpacing.xs + 2),
            decoration: BoxDecoration(
              color: colors.navy,
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 220),
                  child: Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: Colors.white)),
                ),
                const SizedBox(width: AppSpacing.xs),
                const Icon(Icons.close_rounded, size: 14, color: Colors.white),
              ],
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, 0),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.xs,
        children: [
          if (search.practice != null)
            chip(practiceLabel(ref, search.practice!),
                () => onChanged(search.copyWith(practice: () => null))),
          if (search.state != null)
            chip(usStateByCode(search.state)?.name ?? search.state!,
                () => onChanged(search.copyWith(state: () => null))),
        ],
      ),
    );
  }
}

/// Translator-only helper for empty states.
String mineEmpty(Translator t, MineSearch s, String key) =>
    s.isEmpty ? t.t(key) : t.t('mine.search.noMatch');
