import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/shell/content_column_frame.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';

const _kViewKey = 'recommended_sheet_view';

/// Owner 2026-10-13: «more» next to "Recommended" opens every
/// recommendation in a sheet, endless, as rows or as tiles (the choice is
/// remembered on the device).
Future<void> showRecommendedSheet(BuildContext context) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    constraints: contentColumnSheetConstraints(context),
    useRootNavigator: true,
    useSafeArea: true,
    backgroundColor: sheetRouteColor(context, colors.sheet),
    elevation: sheetDrawnByColumn(context) ? 0 : null,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
    ),
    builder: (_) => ContentColumnFrame(
      surface: colors.sheet,
      radius: const BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
      child: const FractionallySizedBox(
        heightFactor: 0.92,
        child: GlassPanel(
          radius: BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
          child: RecommendedSheet(),
        ),
      ),
    ),
  );
}

class RecommendedSheet extends ConsumerStatefulWidget {
  const RecommendedSheet({super.key});

  @override
  ConsumerState<RecommendedSheet> createState() => _RecommendedSheetState();
}

class _RecommendedSheetState extends ConsumerState<RecommendedSheet> {
  final _scroll = ScrollController();
  late bool _grid =
      ref.read(localKvStoreProvider).getString(_kViewKey) == 'grid';

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 600) {
        ref.read(suggestionsProvider.notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _setView({required bool grid}) {
    setState(() => _grid = grid);
    ref.read(localKvStoreProvider).setString(_kViewKey, grid ? 'grid' : 'list');
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(currentUserIdProvider);
    final value = ref.watch(suggestionsProvider);
    final rows = [
      for (final r in value.value?.items ?? const <AttorneyRow>[])
        if (r.id != me) r,
    ];
    Widget viewButton(IconData icon, {required bool grid}) {
      final active = _grid == grid;
      return IconButton(
        visualDensity: VisualDensity.compact,
        onPressed: () => _setView(grid: grid),
        icon: Icon(
          icon,
          size: 22,
          color: active ? colors.goldAccent : colors.textSecondary,
        ),
      );
    }

    return Column(
      children: [
        const SizedBox(height: AppSpacing.sm),
        const AppSheetHandle(),
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            AppSpacing.screenSide,
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.xs,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  t.t('search.recommended'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
              viewButton(Icons.view_list_rounded, grid: false),
              const SizedBox(width: 8),
              viewButton(Icons.grid_view_rounded, grid: true),
            ],
          ),
        ),
        Expanded(
          child: value.isLoading && rows.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : CustomScrollView(
                  controller: _scroll,
                  slivers: [
                    if (_grid)
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.screenSide,
                          AppSpacing.sm,
                          AppSpacing.screenSide,
                          AppSpacing.xxl,
                        ),
                        sliver: SliverGrid.builder(
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            mainAxisSpacing: AppSpacing.sm,
                            crossAxisSpacing: AppSpacing.sm,
                            mainAxisExtent: RecommendedTile.height,
                          ),
                          itemCount: rows.length,
                          itemBuilder: (_, i) => RecommendedTile(
                            key: ValueKey('sheet-${rows[i].id}'),
                            row: rows[i],
                            width: double.infinity,
                          ),
                        ),
                      )
                    else
                      SliverList.builder(
                        itemCount: rows.length,
                        itemBuilder: (_, i) => AttorneyTile(
                          key: ValueKey(rows[i].id),
                          row: rows[i],
                        ),
                      ),
                    if (value.value?.isLoadingMore ?? false)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.all(AppSpacing.lg),
                          child: Center(child: CircularProgressIndicator()),
                        ),
                      ),
                    const SliverToBoxAdapter(
                      child: SizedBox(height: AppSpacing.xxl),
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}
