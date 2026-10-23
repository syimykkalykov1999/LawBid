import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/search/application/public_directory_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// Owner 2026-10-22 (guest browsing): one verified attorney of the public
/// directory — photo, name with the identity check, «★ 4.8 · 12 reviews»,
/// practices and states. A tap opens `/lawyer/<username>`.
class PublicAttorneyTile extends ConsumerWidget {
  const PublicAttorneyTile({required this.attorney, super.key});

  final PublicAttorney attorney;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = attorney;
    final rating = a.ratingCount == 0
        ? t.t('profile.rating.new')
        : '${a.ratingAvg.toStringAsFixed(1)} · '
            '${SocialFormat.plural(
            t,
            f,
            'profile.rating.count',
            a.ratingCount,
          )}';
    final details = [
      a.practices.take(3).join(', '),
      a.states.take(4).join(', '),
    ].where((x) => x.isNotEmpty).join(' · ');
    return Semantics(
      button: true,
      label: [
        a.displayName,
        if (a.trustBadge) t.t('trust.level.2'),
        rating,
        details,
      ].join(', '),
      excludeSemantics: true,
      child: AppPressable(
        onTap: () => context.push(AppRoutes.lawyer(a.username)),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.md,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppAvatar(
                imageProvider:
                    a.photoUrl == null ? null : NetworkImage(a.photoUrl!),
                initials: a.initials,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            a.displayName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.body.copyWith(
                              color: colors.text,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (a.trustBadge) ...[
                          const SizedBox(width: 4),
                          AppIcon(
                            AppIcons.verifiedRounded,
                            size: AppSizes.iconSm,
                            color: colors.accent,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        AppIcon(
                          AppIcons.starRounded,
                          size: AppSizes.iconSm,
                          color: colors.gold,
                        ),
                        const SizedBox(width: 2),
                        Flexible(
                          child: Text(
                            rating,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ),
                      ],
                    ),
                    if (details.isNotEmpty)
                      Text(
                        details,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The directory as a scrolling list with loading, error and empty states,
/// shared by the guest feed and the guest search ([filter] narrows it).
class PublicDirectoryList extends ConsumerWidget {
  const PublicDirectoryList({
    super.key,
    this.filter = '',
    this.header,
  });

  /// Local query (name, @username, practice, state, firm).
  final String filter;

  /// Drawn above the rows (the guest feed's sign-in card).
  final Widget? header;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(publicDirectoryProvider);
    final page = value.value;
    final Widget body;
    if (page == null && value.isLoading) {
      body = const Padding(
        padding: EdgeInsets.all(AppSpacing.screenSide),
        child: Column(
          children: [
            AppSkeleton(height: 52),
            SizedBox(height: AppSpacing.md),
            AppSkeleton(height: 52),
            SizedBox(height: AppSpacing.md),
            AppSkeleton(height: 52),
          ],
        ),
      );
    } else if (page == null) {
      body = AppErrorState(
        key: const ValueKey('guest-directory-error'),
        message: t.t('guest.directory.error'),
        retryLabel: t.t('error.retry'),
        onRetry: () => ref.invalidate(publicDirectoryProvider),
      );
    } else {
      final rows = page.items.where((a) => a.matches(filter)).toList();
      body = rows.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: Text(
                t.t('guest.search.empty'),
                textAlign: TextAlign.center,
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            )
          : Column(
              children: [
                for (final a in rows)
                  PublicAttorneyTile(
                    key: ValueKey('public-attorney-${a.username}'),
                    attorney: a,
                  ),
              ],
            );
    }
    return RefreshIndicator(
      color: colors.gold,
      onRefresh: () async {
        ref.invalidate(publicDirectoryProvider);
        try {
          await ref.read(publicDirectoryProvider.future);
        } catch (_) {
          // The error state renders the failure.
        }
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 400 && filter.isEmpty) {
            ref.read(publicDirectoryProvider.notifier).loadMore();
          }
          return false;
        },
        child: ListView(
          padding: EdgeInsets.only(
            bottom: AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            if (header != null) header!,
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(
                AppSpacing.screenSide,
                AppSpacing.md,
                AppSpacing.screenSide,
                AppSpacing.xs,
              ),
              child: Text(
                t.t('guest.feed.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            body,
          ],
        ),
      ),
    );
  }
}
