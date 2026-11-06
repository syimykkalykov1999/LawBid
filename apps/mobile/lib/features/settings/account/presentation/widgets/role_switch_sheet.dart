import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_step_up.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/role_switch_preview.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-11-05: Settings → Account «Сменить профиль». Shows what stands
/// in the way, or what happens next and the password / passkey step (no SMS
/// path). Pops with the fresh [CurrentUser] once the server has switched;
/// the Account screen then rebuilds the app around the new role.
class RoleSwitchSheet extends ConsumerStatefulWidget {
  const RoleSwitchSheet({super.key});

  @override
  ConsumerState<RoleSwitchSheet> createState() => _RoleSwitchSheetState();
}

class _RoleSwitchSheetState extends ConsumerState<RoleSwitchSheet> {
  late Future<RoleSwitchPreview> _preview = _load();
  List<String>? _blockers;
  String? _error;

  Future<RoleSwitchPreview> _load() =>
      ref.read(roleSwitchRepositoryProvider).preview();

  Future<void> _switch(RoleSwitchPreview preview, String reauthToken) async {
    final t = ref.read(translatorProvider);
    setState(() => _error = null);
    final CurrentUser user;
    try {
      user = await ref
          .read(roleSwitchRepositoryProvider)
          .switchTo(preview.to, reauthToken);
    } on ApiException catch (e) {
      if (!mounted) return;
      final blockers = e.details?['blockers'];
      setState(() {
        if (e.code == ApiErrorCodes.roleSwitchBlocked && blockers is List) {
          _blockers = blockers.whereType<String>().toList();
        } else {
          _error = apiErrorText(t, e);
        }
      });
      return;
    }
    // Lists of the old role must not come back from the phone's copy.
    await ref.read(httpCacheInterceptorProvider).clear();
    // The new role claim (as after the onboarding role step). A failure or
    // a slow network here is not a failed switch: the server has switched,
    // and the next expired token refreshes anyway.
    try {
      await ref
          .read(sessionControllerProvider.notifier)
          .refreshAccessToken()
          .timeout(const Duration(seconds: 15));
    } on Object {
      // See above.
    }
    if (mounted) Navigator.of(context).pop(user);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    Widget body(RoleSwitchPreview preview) {
      final blockers = _blockers ?? preview.blockers;
      if (blockers.isNotEmpty) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              t.t('account.roleSwitch.blocked'),
              style: typography.body.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final b in blockers)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Text(
                  '• ${t.t('account.roleSwitch.blocker.$b')}',
                  style: typography.body.copyWith(color: colors.textSecondary),
                ),
              ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('role-switch-close'),
              label: t.t('common.close'),
              variant: AppButtonVariant.secondary,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        );
      }
      if (preview.retryAfterSeconds > 0) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              t.t('error.api.RATE_LIMITED'),
              style: typography.body.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('role-switch-close'),
              label: t.t('common.close'),
              variant: AppButtonVariant.secondary,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        );
      }
      final toAttorney = preview.to == UserRole.attorney;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            t.t(
              toAttorney
                  ? 'account.roleSwitch.toAttorney'
                  : 'account.roleSwitch.toClient',
            ),
            style: typography.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('account.roleSwitch.keep'),
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
          if (preview.needsOnboarding) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t(
                toAttorney
                    ? 'account.roleSwitch.newAttorney'
                    : 'account.roleSwitch.newClient',
              ),
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              _error!,
              key: const ValueKey('role-switch-error'),
              style: typography.bodySmall.copyWith(color: colors.danger),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          // No onUseCode: no «get a code by SMS» on this step.
          PasswordStepUp(
            autofocus: false,
            onToken: (token) => _switch(preview, token),
          ),
        ],
      );
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg + bottom,
      ),
      child: FutureBuilder<RoleSwitchPreview>(
        future: _preview,
        builder: (context, snap) {
          if (snap.hasError) {
            return AppErrorState(
              message: errorText(t, snap.error!),
              retryLabel: t.t('error.retry'),
              onRetry: () => setState(() => _preview = _load()),
            );
          }
          final preview = snap.data;
          if (preview == null) {
            return const SizedBox(height: 160, child: AppSkeletonCard());
          }
          return SingleChildScrollView(child: body(preview));
        },
      ),
    );
  }
}
