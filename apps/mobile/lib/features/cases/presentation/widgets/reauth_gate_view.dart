import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_step_up.dart';
import 'package:lawbid/features/cases/application/case_history_controller.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// Re-authentication gate (docs/04 §12, docs/06 §5.2). Owner 2026-10-28:
/// the ACCOUNT PASSWORD first ([PasswordStepUp]); a code to the verified
/// phone only after «Забыли пароль?» or for an account without a password
/// → `POST /auth/reauth`; the resulting token lives in
/// [historyAccessProvider] for five minutes and unlocks every
/// reauth-guarded settings screen (case history, data export).
class ReauthGateView extends ConsumerWidget {
  const ReauthGateView({
    required this.access,
    required this.t,
    this.note,
    super.key,
  });

  final HistoryAccess access;
  final Translator t;

  /// Small print under the actions (e.g. "read-only" for the history).
  final String? note;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = ref.read(historyAccessProvider.notifier);
    final phone = c.phone;
    // Owner 2026-10-08: no code can reach a demo session — one tap instead.
    final demo = ref.watch(isDemoSessionProvider);
    // Owner 2026-10-28: the account password instead of a paid SMS code.
    final noPassword = ref.watch(
      currentUserControllerProvider
          .select((s) => s.user?.passwordRequired ?? false),
    );
    final password = !demo && !access.useCode && !noPassword;
    final error = switch (access.error) {
      'invalid' => t.t('history.reauth.invalid'),
      'rateLimited' => t.t('history.reauth.rateLimited'),
      'network' => t.t('offline.message'),
      _ => null,
    };
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.xxxl,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        const AppEntrance(
          scale: true,
          child: Center(
            child: AppIconMedallion(
              icon: AppIcons.lockPersonOutlined,
              size: AppSizes.stateMedallion,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        AppEntrance(
          index: 1,
          child: Text(
            t.t('history.reauth.title'),
            textAlign: TextAlign.center,
            style: typography.titleLarge.copyWith(color: colors.text),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppEntrance(
          index: 2,
          child: Text(
            demo
                ? t.t('demo.reauth.message')
                : password
                    ? t.t('stepUp.password.body')
                    : phone == null
                        ? t.t('history.reauth.noPhone')
                        : t.t('history.reauth.message', {'phone': phone}),
            textAlign: TextAlign.center,
            style: typography.body.copyWith(color: colors.textSecondary),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        if (demo) ...[
          if (error != null) ...[
            Text(
              error,
              textAlign: TextAlign.center,
              style: typography.bodySmall.copyWith(color: colors.dangerText),
            ),
            const SizedBox(height: AppSpacing.xl),
          ],
          AppButton(
            key: const ValueKey('reauth-demo-continue'),
            label: t.t('demo.reauth.continue'),
            isLoading: access.busy,
            onPressed: c.continueDemo,
          ),
        ] else if (password)
          PasswordStepUp(
            key: const ValueKey('reauth-password'),
            onToken: (token) async => c.acceptToken(token),
            onUseCode: c.useCode,
          )
        else if (access.codeSent)
          AppOtpField(
            semanticLabel: t.t('history.reauth.code'),
            errorText: error,
            onCompleted: c.submitCode,
          )
        else if (error != null)
          Text(
            error,
            textAlign: TextAlign.center,
            style: typography.bodySmall.copyWith(color: colors.dangerText),
          ),
        if (!demo && !password) const SizedBox(height: AppSpacing.xl),
        if (!demo && !password && !access.codeSent && phone != null)
          AppButton(
            label: t.t('history.reauth.send'),
            isLoading: access.busy,
            onPressed: c.sendCode,
          ),
        if (!demo && !password && access.codeSent)
          AppButton(
            label: t.t('history.reauth.resend'),
            variant: AppButtonVariant.secondary,
            isLoading: access.busy,
            onPressed: c.sendCode,
          ),
        if (note != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(
            note!,
            textAlign: TextAlign.center,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ],
    );
  }
}
