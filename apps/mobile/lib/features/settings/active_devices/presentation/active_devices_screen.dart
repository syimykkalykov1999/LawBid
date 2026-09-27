import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/settings/active_devices/application/active_devices_controller.dart';
import 'package:lawbid/features/settings/active_devices/domain/device_session_info.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// `/profile/settings/devices` (docs/01 §10.4 "Активные устройства"): the
/// account's active sessions with per-row revoke and "sign out
/// everywhere". Every docs/01 §8.3 state: skeleton loading, empty, error +
/// Retry, offline (full-screen only when nothing is loaded — otherwise the
/// rows stay and the global banner reports it), pull-to-refresh and the
/// cursor pagination footer.
///
/// Presentation imports domain types only (docs/01 §6.4) — moved here from
/// features/profile (p12 leaf-1.6), where it used the auth wire DTO.
class ActiveDevicesScreen extends ConsumerStatefulWidget {
  const ActiveDevicesScreen({super.key});

  @override
  ConsumerState<ActiveDevicesScreen> createState() =>
      _ActiveDevicesScreenState();
}

class _ActiveDevicesScreenState extends ConsumerState<ActiveDevicesScreen> {
  final Set<String> _revoking = {};

  ActiveDevicesController get _controller =>
      ref.read(activeDevicesControllerProvider.notifier);

  Future<bool> _confirm({
    required String title,
    required String body,
    required String action,
  }) async {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.read(translatorProvider);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(action, style: TextStyle(color: colors.danger)),
          ),
        ],
      ),
    );
    return (confirmed ?? false) && mounted;
  }

  Future<void> _revoke(DeviceSessionInfo session) async {
    final t = ref.read(translatorProvider);
    final ok = await _confirm(
      title: t.t('devices.revoke.confirm.title'),
      body: session.isCurrent
          ? t.t('devices.revoke.confirm.currentBody')
          : t.t('devices.revoke.confirm.body'),
      action: t.t('devices.revoke.confirm.action'),
    );
    if (!ok) return;
    setState(() => _revoking.add(session.sessionId));
    try {
      await _controller.revoke(session.sessionId);
      if (session.isCurrent) {
        await ref.read(sessionControllerProvider.notifier).clear();
        if (mounted) context.go(AuthRoutes.welcome);
      }
    } on Object catch (error) {
      if (mounted) showAppSnackBar(context, errorText(t, error));
    } finally {
      if (mounted) setState(() => _revoking.remove(session.sessionId));
    }
  }

  Future<void> _logoutAll() async {
    final t = ref.read(translatorProvider);
    final ok = await _confirm(
      title: t.t('devices.logoutAll.confirm.title'),
      body: t.t('devices.logoutAll.confirm.body'),
      action: t.t('devices.logoutAll'),
    );
    if (!ok) return;
    try {
      await _controller.logoutAll();
      await ref.read(sessionControllerProvider.notifier).clear();
      if (mounted) context.go(AuthRoutes.welcome);
    } on Object catch (error) {
      if (mounted) showAppSnackBar(context, errorText(t, error));
    }
  }

  Future<void> _pullToRefresh() async {
    try {
      await _controller.refresh();
    } on Object catch (error) {
      // Rows stay on screen; just say why they didn't update.
      if (mounted) {
        showAppSnackBar(
            context, errorText(ref.read(translatorProvider), error));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final async = ref.watch(activeDevicesControllerProvider);
    // Back online after a failed load: reload by itself instead of waiting
    // for the user to find the Retry button (docs/01 §8.3 offline state).
    ref.listen(connectivityStatusProvider, (previous, next) {
      final current = ref.read(activeDevicesControllerProvider);
      if ((previous?.isOffline ?? false) &&
          next.isOnline &&
          current.hasError &&
          !current.isLoading) {
        _controller.refresh();
      }
    });

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('devices.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: AnimatedSwitcher(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
        child: switch (async) {
          AsyncData(:final value) => _DevicesList(
              key: const ValueKey('devices-data'),
              list: value,
              t: t,
              revoking: _revoking,
              onRevoke: _revoke,
              onLogoutAll: _logoutAll,
              onRefresh: _pullToRefresh,
              onLoadMore: _controller.loadMore,
              onRetryMore: _controller.retryLoadMore,
            ),
          AsyncError(:final error) => KeyedSubtree(
              key: const ValueKey('devices-error'),
              child: isOfflineError(error)
                  ? AppOfflineState(
                      title: t.t('offline.title'),
                      message: t.t('offline.message'),
                      action: AppButton(
                        label: t.t('error.retry'),
                        icon: Icons.refresh_rounded,
                        variant: AppButtonVariant.secondary,
                        height: AppSizes.touchTarget,
                        onPressed: _controller.refresh,
                      ),
                    )
                  : AppErrorState(
                      message: t.t('devices.error'),
                      retryLabel: t.t('error.retry'),
                      onRetry: _controller.refresh,
                    ),
            ),
          _ => const _DevicesLoading(key: ValueKey('devices-loading')),
        },
      ),
    );
  }
}

class _DevicesList extends StatelessWidget {
  const _DevicesList({
    required this.list,
    required this.t,
    required this.revoking,
    required this.onRevoke,
    required this.onLogoutAll,
    required this.onRefresh,
    required this.onLoadMore,
    required this.onRetryMore,
    super.key,
  });

  final PaginatedList<DeviceSessionInfo> list;
  final Translator t;
  final Set<String> revoking;
  final ValueChanged<DeviceSessionInfo> onRevoke;
  final VoidCallback onLogoutAll;
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
      return RefreshIndicator(
        color: colors.gold,
        backgroundColor: colors.surface,
        onRefresh: onRefresh,
        child: AppEmptyState(
          icon: Icons.devices_rounded,
          message: t.t('devices.empty'),
        ),
      );
    }

    return AppPaginatedListView<DeviceSessionInfo>(
      items: list.items,
      itemKey: (s) => s.sessionId,
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
      header: AppEntrance(
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.lg),
          child: Text(
            t.t('devices.subtitle'),
            style: typography.body.copyWith(color: colors.textSecondary),
          ),
        ),
      ),
      itemBuilder: (context, session, index) => AppEntrance(
        // Only the first screenful staggers in; later pages just appear.
        index: index < 8 ? index + 1 : 0,
        child: _DeviceRow(
          session: session,
          t: t,
          busy: revoking.contains(session.sessionId),
          onRevoke: () => onRevoke(session),
        ),
      ),
      footer: Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: AppButton(
          label: t.t('devices.logoutAll'),
          icon: Icons.logout_rounded,
          variant: AppButtonVariant.secondary,
          onPressed: onLogoutAll,
        ),
      ),
    );
  }
}

class _DevicesLoading extends StatelessWidget {
  const _DevicesLoading({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.md,
      ),
      children: const [
        FractionallySizedBox(
          alignment: Alignment.centerLeft,
          widthFactor: 0.6,
          child: AppSkeleton(),
        ),
        SizedBox(height: AppSpacing.lg),
        AppSkeletonCard(),
        SizedBox(height: AppSpacing.md),
        AppSkeletonCard(),
        SizedBox(height: AppSpacing.md),
        AppSkeletonCard(),
      ],
    );
  }
}

class _DeviceRow extends StatelessWidget {
  const _DeviceRow({
    required this.session,
    required this.t,
    required this.busy,
    required this.onRevoke,
  });

  final DeviceSessionInfo session;
  final Translator t;
  final bool busy;
  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = session.hasName
        ? session.deviceName!.trim()
        : t.t('devices.unknownDevice');
    final lastActive = session.lastActiveAt;
    final lastActiveLabel = lastActive == null
        ? t.t('devices.lastActive.unknown')
        : t.t('devices.lastActive', {'time': _formatTimestamp(lastActive)});

    return AppCard(
      elevated: true,
      child: Row(
        children: [
          AppIconMedallion(
            icon: _platformIcon(session.platform),
            tone: session.isCurrent
                ? AppMedallionTone.gold
                : AppMedallionTone.neutral,
            iconSize: AppSizes.iconMd,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      name,
                      style: typography.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (session.isCurrent)
                      AppChip(
                        label: t.t('devices.current'),
                        height: AppSpacing.xl,
                        selected: true,
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  lastActiveLabel,
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          SizedBox.square(
            dimension: AppSizes.hitTarget,
            child: busy
                ? Center(
                    child: SizedBox.square(
                      dimension: AppSizes.footerSpinner,
                      child: CircularProgressIndicator(
                        strokeWidth: AppSizes.footerSpinnerStroke,
                        color: colors.danger,
                      ),
                    ),
                  )
                : IconButton(
                    icon: Icon(
                      Icons.logout_rounded,
                      color: colors.danger,
                      size: AppSizes.iconSm,
                    ),
                    tooltip: t.t('devices.revoke'),
                    onPressed: onRevoke,
                  ),
          ),
        ],
      ),
    );
  }

  IconData _platformIcon(DevicePlatform platform) => switch (platform) {
        DevicePlatform.ios => Icons.phone_iphone,
        DevicePlatform.android => Icons.phone_android,
        DevicePlatform.web => Icons.computer,
        DevicePlatform.unknown => Icons.devices_other,
      };

  String _formatTimestamp(DateTime utc) {
    final local = utc.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${local.year}-${two(local.month)}-${two(local.day)} '
        '${two(local.hour)}:${two(local.minute)}';
  }
}
