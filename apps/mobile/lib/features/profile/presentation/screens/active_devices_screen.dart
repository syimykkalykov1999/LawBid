import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/profile/application/active_devices_controller.dart';

/// `/profile/settings/devices` (file 01 §10.4's "Активные устройства"):
/// list of this account's active sessions, with per-row revoke and a
/// "sign out everywhere" action. Phase 4 of the auth networking work
/// (docs/CHANGELOG.md), continuing directly after Phase 3 social login
/// (commit 2bbeba5).
class ActiveDevicesScreen extends ConsumerWidget {
  const ActiveDevicesScreen({super.key});

  Future<void> _confirmAndRevoke(
    BuildContext context,
    WidgetRef ref,
    Translator t,
    DeviceSession session,
  ) async {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(t.t('devices.revoke.confirm.title')),
        content: Text(
          session.isCurrent
              ? t.t('devices.revoke.confirm.currentBody')
              : t.t('devices.revoke.confirm.body'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              t.t('devices.revoke.confirm.action'),
              style: TextStyle(color: colors.danger),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    await ref
        .read(activeDevicesControllerProvider.notifier)
        .revoke(session.sessionId);
    if (session.isCurrent) {
      await ref.read(sessionControllerProvider.notifier).clear();
      if (context.mounted) context.go(AuthRoutes.welcome);
    }
  }

  Future<void> _confirmAndLogoutAll(
    BuildContext context,
    WidgetRef ref,
    Translator t,
  ) async {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(t.t('devices.logoutAll.confirm.title')),
        content: Text(t.t('devices.logoutAll.confirm.body')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              t.t('devices.logoutAll'),
              style: TextStyle(color: colors.danger),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    await ref.read(authRepositoryProvider).logoutAll();
    await ref.read(sessionControllerProvider.notifier).clear();
    if (context.mounted) context.go(AuthRoutes.welcome);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final sessionsAsync = ref.watch(activeDevicesControllerProvider);
    Future<void> retry() =>
        ref.read(activeDevicesControllerProvider.notifier).refresh();

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('devices.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      // UI modernization pass (2026-09-27): skeleton cards that match the
      // real rows, offline state for connectivity failures, elevated cards
      // with a staggered entrance, pull-to-refresh in brand gold.
      body: sessionsAsync.when(
        loading: () => const _DevicesLoading(),
        error: (error, stackTrace) {
          if (error is ApiException && error.isNetworkError) {
            return AppOfflineState(
              title: t.t('offline.title'),
              message: t.t('offline.message'),
              action: AppButton(
                label: t.t('error.retry'),
                icon: Icons.refresh_rounded,
                variant: AppButtonVariant.secondary,
                height: AppSizes.touchTarget,
                onPressed: retry,
              ),
            );
          }
          return AppErrorState(
            message: t.t('devices.error'),
            retryLabel: t.t('error.retry'),
            onRetry: retry,
          );
        },
        data: (sessions) {
          if (sessions.isEmpty) {
            return AppEmptyState(
              icon: Icons.devices_rounded,
              message: t.t('devices.empty'),
            );
          }
          return RefreshIndicator(
            color: colors.gold,
            onRefresh: retry,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.sm,
                AppSpacing.screenSide,
                AppSpacing.xxl,
              ),
              children: [
                AppEntrance(
                  child: Text(
                    t.t('devices.subtitle'),
                    style:
                        typography.body.copyWith(color: colors.textSecondary),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                for (var i = 0; i < sessions.length; i++) ...[
                  AppEntrance(
                    index: i + 1,
                    child: _DeviceRow(
                      session: sessions[i],
                      t: t,
                      onRevoke: () =>
                          _confirmAndRevoke(context, ref, t, sessions[i]),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
                const SizedBox(height: AppSpacing.md),
                AppEntrance(
                  index: sessions.length + 1,
                  child: AppButton(
                    label: t.t('devices.logoutAll'),
                    icon: Icons.logout_rounded,
                    variant: AppButtonVariant.secondary,
                    onPressed: () => _confirmAndLogoutAll(context, ref, t),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DevicesLoading extends StatelessWidget {
  const _DevicesLoading();

  @override
  Widget build(BuildContext context) {
    return ListView(
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
    required this.onRevoke,
  });

  final DeviceSession session;
  final Translator t;
  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = session.deviceName?.trim().isNotEmpty ?? false
        ? session.deviceName!
        : t.t('devices.unknownDevice');
    final lastActive = session.lastUsedAt;
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
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        name,
                        style: typography.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (session.isCurrent) ...[
                      const SizedBox(width: AppSpacing.xs),
                      AppChip(
                        label: t.t('devices.current'),
                        height: 24,
                        selected: true,
                      ),
                    ],
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
          IconButton(
            icon: Icon(
              Icons.logout_rounded,
              color: colors.danger,
              size: AppSizes.iconSm,
            ),
            tooltip: t.t('devices.revoke'),
            onPressed: onRevoke,
          ),
        ],
      ),
    );
  }

  IconData _platformIcon(String? platform) {
    switch (platform?.toLowerCase()) {
      case 'ios':
        return Icons.phone_iphone;
      case 'android':
        return Icons.phone_android;
      case 'web':
        return Icons.computer;
      default:
        return Icons.devices_other;
    }
  }

  String _formatTimestamp(String iso) {
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return iso;
    final local = parsed.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${local.year}-${two(local.month)}-${two(local.day)} ${two(local.hour)}:${two(local.minute)}';
  }
}
