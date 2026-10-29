import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';

/// Owner 2026-10-18 (Instagram): Settings → «Архив» — the viewer's own
/// archived posts as a grid, newest archived first. A tap opens the post;
/// its ⋯ menu has «Показать в профиле».
class ArchiveScreen extends ConsumerWidget {
  const ArchiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(archivedPostsProvider);
    final notifier = ref.read(archivedPostsProvider.notifier);
    final overrides = ref.watch(postOverridesProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('settings.archive')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: switch (value) {
          AsyncData(:final value) => () {
              // A post shown in the profile again leaves the grid at once.
              final posts = [
                for (final p in value.items)
                  if (overrides[p.id]?.isArchived ?? true) overrides[p.id] ?? p,
              ];
              if (posts.isEmpty) {
                return AppEmptyState(
                  key: const ValueKey('archive-empty'),
                  icon: AppIcons.inventory2Outlined,
                  title: t.t('archive.empty.title'),
                  message: t.t('archive.empty.message'),
                );
              }
              return AppRefreshIndicator(
                color: colors.gold,
                onRefresh: notifier.refresh,
                child: GridView.builder(
                  key: const ValueKey('archive-grid'),
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.zero,
                  gridDelegate: profileGridDelegate(),
                  itemCount: posts.length,
                  itemBuilder: (context, i) {
                    if (i == posts.length - 1 && value.canLoadMore) {
                      notifier.loadMore();
                    }
                    final p = posts[i];
                    return PostGridTile(
                      key: ValueKey('archive-tile-${p.id}'),
                      post: p,
                      showPin: false,
                      semanticLabel: t.t('post.open'),
                      onTap: () => ArchivedPostScreen.open(context, p),
                    );
                  },
                ),
              );
            }(),
          AsyncError(:final error) => CasesErrorView(
              error: error,
              t: t,
              onRetry: () => ref.invalidate(archivedPostsProvider),
            ),
          _ => GridView.count(
              padding: EdgeInsets.zero,
              crossAxisCount: 3,
              mainAxisSpacing: 2,
              crossAxisSpacing: 2,
              children:
                  List.generate(9, (_) => const AppSkeleton(borderRadius: 0)),
            ),
        },
      ),
    );
  }
}

/// One archived post, opened from the archive grid: a note that only the
/// author sees it, then the usual card (its ⋯ menu restores it).
class ArchivedPostScreen extends ConsumerWidget {
  const ArchivedPostScreen({required this.post, super.key});

  final Post post;

  static Future<void> open(BuildContext context, Post post) =>
      Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => ArchivedPostScreen(post: post),
        ),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = ref.watch(postOverridesProvider)[post.id] ?? post;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('settings.archive')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: ListView(
        padding: EdgeInsets.only(
          bottom: MediaQuery.paddingOf(context).bottom + AppSpacing.xl,
        ),
        children: [
          if (p.isArchived)
            Padding(
              key: const ValueKey('archive-post-note'),
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.md,
                AppSpacing.screenSide,
                AppSpacing.sm,
              ),
              child: Row(
                children: [
                  AppIcon(
                    AppIcons.inventory2Outlined,
                    color: colors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      t.t('archive.post.note'),
                      style:
                          type.bodySmall.copyWith(color: colors.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
          PostCard(post: p, inDetail: true),
        ],
      ),
    );
  }
}
