import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/l10n_providers.dart';
import '../../../../core/l10n/translator.dart';
import '../../../../core/session/session_providers.dart';
import '../../../auth/application/auth_providers.dart';
import '../../../auth/auth_routes.dart';
import '../../../auth/data/auth_dtos.dart';
import '../../application/active_devices_controller.dart';

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

    await ref.read(activeDevicesControllerProvider.notifier).revoke(session.sessionId);
    if (session.isCurrent) {
      await ref.read(sessionControllerProvider.notifier).clear();
      if (context.mounted) context.go(AuthRoutes.welcome);
    }
  }

  Future<void> _confirmAndLogoutAll(BuildContext context, WidgetRef ref, Translator t) async {
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
            child: Text(t.t('devices.logoutAll'), style: TextStyle(color: colors.danger)),
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
    final t = ref.watch(translatorProvider);
    final sessionsAsync = ref.watch(activeDevicesControllerProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('devices.title')),
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: colors.text),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: sessionsAsync.when(
        loading: () => const _DevicesLoading(),
        error: (error, stackTrace) => AppErrorState(
          message: t.t('devices.error'),
          retryLabel: t.t('error.retry'),
          onRetry: () => ref.read(activeDevicesControllerProvider.notifier).refresh(),
        ),
        data: (sessions) {
          if (sessions.isEmpty) {
            return AppEmptyState(message: t.t('devices.empty'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(activeDevicesControllerProvider.notifier).refresh(),
            child: ListView(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
                vertical: AppSpacing.md,
              ),
              children: [
                for (final session in sessions) ...[
                  _DeviceRow(
                    session: session,
                    t: t,
                    onRevoke: () => _confirmAndRevoke(context, ref, t, session),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                ],
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: t.t('devices.logoutAll'),
                  variant: AppButtonVariant.secondary,
                  onPressed: () => _confirmAndLogoutAll(context, ref, t),
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
        AppSkeleton(height: 76, borderRadius: AppRadii.roleCard),
        SizedBox(height: AppSpacing.sm),
        AppSkeleton(height: 76, borderRadius: AppRadii.roleCard),
        SizedBox(height: AppSpacing.sm),
        AppSkeleton(height: 76, borderRadius: AppRadii.roleCard),
      ],
    );
  }
}

class _DeviceRow extends StatelessWidget {
  const _DeviceRow({required this.session, required this.t, required this.onRevoke});

  final DeviceSession session;
  final Translator t;
  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = session.deviceName?.trim().isNotEmpty == true
        ? session.deviceName!
        : t.t('devices.unknownDevice');
    final lastActive = session.lastUsedAt;
    final lastActiveLabel = lastActive == null
        ? t.t('devices.lastActive.unknown')
        : t.t('devices.lastActive', {'time': _formatTimestamp(lastActive)});

    return AppCard(
      child: Row(
        children: [
          Icon(_platformIcon(session.platform), color: colors.textSecondary, size: 28),
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
                        style: typography.body.copyWith(color: colors.text),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (session.isCurrent) ...[
                      const SizedBox(width: AppSpacing.xs),
                      AppChip(label: t.t('devices.current'), height: 24, selected: true),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  lastActiveLabel,
                  style: typography.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.logout, color: colors.danger, size: 20),
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
