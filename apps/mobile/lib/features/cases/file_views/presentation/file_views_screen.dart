import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/file_views/application/file_views_providers.dart';
import 'package:lawbid/features/cases/file_views/domain/file_view.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Opens «Просмотры» of one case document (owner 2026-10-24). A pushed
/// screen: the list is the device's own copy at once, newer rows join it
/// in the background.
Future<void> openFileViews(BuildContext context, String fileId) =>
    Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => FileViewsScreen(fileId: fileId)),
    );

/// «Просмотры»: who opened this document - avatar, name and role, the date
/// and time in the phone's time zone, the device and the masked address
/// (`203.0.113.x`: enough to tell the usual office from another country,
/// not enough to locate a person). Only the file's owner can open it (the
/// server answers 404 to anyone else).
class FileViewsScreen extends ConsumerWidget {
  const FileViewsScreen({required this.fileId, super.key});

  final String fileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final provider = fileViewsProvider(fileId);
    final async = ref.watch(provider);
    final notifier = ref.read(provider.notifier);
    // Back online after a failed first load: read again by itself.
    ref.listen(connectivityStatusProvider, (previous, next) {
      final current = ref.read(provider);
      if ((previous?.isOffline ?? false) &&
          next.isOnline &&
          current.hasError &&
          !current.isLoading) {
        notifier.refresh();
      }
    });
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('fileViews.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (async) {
        AsyncData(:final value) => _ViewsList(
            key: const ValueKey('file-views-data'),
            list: value,
            t: t,
            formats: ref.watch(l10nFormatsProvider),
            onRefresh: () async {
              try {
                await notifier.refresh();
              } on Object catch (e) {
                if (context.mounted) {
                  showAppSnackBar(context, errorText(t, e));
                }
              }
            },
            onLoadMore: notifier.loadMore,
            onRetryMore: notifier.retryLoadMore,
          ),
        AsyncError(:final error) => isOfflineError(error)
            ? AppOfflineState(
                key: const ValueKey('file-views-offline'),
                title: t.t('offline.title'),
                message: t.t('offline.message'),
                action: AppButton(
                  label: t.t('error.retry'),
                  icon: AppIcons.refreshRounded,
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: notifier.refresh,
                ),
              )
            : AppErrorState(
                key: const ValueKey('file-views-error'),
                message: t.t('fileViews.error'),
                retryLabel: t.t('error.retry'),
                onRetry: notifier.refresh,
              ),
        _ => const _ViewsLoading(key: ValueKey('file-views-loading')),
      },
    );
  }
}

class _ViewsList extends StatelessWidget {
  const _ViewsList({
    required this.list,
    required this.t,
    required this.formats,
    required this.onRefresh,
    required this.onLoadMore,
    required this.onRetryMore,
    super.key,
  });

  final PaginatedList<FileView> list;
  final Translator t;
  final L10nFormats formats;
  final Future<void> Function() onRefresh;
  final VoidCallback onLoadMore;
  final VoidCallback onRetryMore;

  AppPaginationStatus get _status {
    if (list.loadMoreError != null) return AppPaginationStatus.error;
    if (list.isLoadingMore) return AppPaginationStatus.loading;
    if (list.hasMore) return AppPaginationStatus.idle;
    return AppPaginationStatus.end;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    if (list.items.isEmpty && !list.hasMore) {
      return AppRefreshIndicator(
        color: colors.gold,
        backgroundColor: colors.sheet,
        onRefresh: onRefresh,
        child: AppEmptyState(
          icon: AppIcons.visibilityOutlined,
          message: t.t('fileViews.empty'),
        ),
      );
    }
    return AppPaginatedListView<FileView>(
      items: list.items,
      itemKey: (v) => v.id,
      status: _status,
      labels: AppPaginationLabels(
        loadingMore: t.t('pagination.loadingMore'),
        error: t.t('pagination.error'),
        retry: t.t('error.retry'),
        end: t.t('pagination.end'),
      ),
      onLoadMore: onLoadMore,
      onRetry: onRetryMore,
      onRefresh: onRefresh,
      header: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.lg),
        child: Text(
          t.t('fileViews.subtitle'),
          style: typography.body.copyWith(color: colors.textSecondary),
        ),
      ),
      itemBuilder: (context, v, index) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: FileViewRow(view: v, t: t, formats: formats),
      ),
    );
  }
}

/// One «who opened it» card.
class FileViewRow extends StatelessWidget {
  const FileViewRow({
    required this.view,
    required this.t,
    required this.formats,
    super.key,
  });

  final FileView view;
  final Translator t;
  final L10nFormats formats;

  String? get _roleLabel => switch (view.viewerRole) {
        'client' => t.t('fileViews.role.client'),
        'attorney' => t.t('fileViews.role.attorney'),
        'assistant' => t.t('fileViews.role.assistant'),
        _ => null,
      };

  /// "iPhone 15 · ios" - the device's own name, else what is known.
  String get _device {
    final name = view.device?.trim() ?? '';
    final platform = view.platform?.trim() ?? '';
    if (name.isNotEmpty) return name;
    if (platform.isNotEmpty) return platform;
    return t.t('fileViews.device.unknown');
  }

  IconData get _deviceIcon => switch (view.platform) {
        'ios' => AppIcons.phoneIphone,
        'android' => AppIcons.phoneAndroid,
        'web' => AppIcons.computer,
        _ => AppIcons.devicesOther,
      };

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = view.viewerName?.trim() ?? '';
    final avatar = view.viewerAvatarUrl;
    final role = _roleLabel;
    final ip = view.ipMasked;
    return AppCard(
      elevated: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppAvatar(
            size: 44,
            initials: avatarInitials(name),
            imageProvider: avatar == null || avatar.isEmpty
                ? null
                : appNetworkImage(avatar, decodeWidthFor(44)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.isEmpty ? t.t('fileViews.role.unknown') : name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (role != null)
                  Text(
                    role,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  formats.dateTime(view.viewedAt),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.bodySmall.copyWith(color: colors.text),
                ),
                const SizedBox(height: AppSpacing.xs),
                Row(
                  children: [
                    AppIcon(
                      _deviceIcon,
                      size: AppSizes.iconSm,
                      color: colors.textSecondary,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(
                        ip == null ? _device : '$_device · $ip',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ViewsLoading extends StatelessWidget {
  const _ViewsLoading({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.md,
      ),
      children: const [
        AppSkeletonCard(),
        SizedBox(height: AppSpacing.md),
        AppSkeletonCard(),
        SizedBox(height: AppSpacing.md),
        AppSkeletonCard(),
      ],
    );
  }
}
