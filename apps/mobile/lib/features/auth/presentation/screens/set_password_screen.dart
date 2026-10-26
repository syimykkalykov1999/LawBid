import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/domain/login_identifier.dart';
import 'package:lawbid/features/auth/domain/password_auth_result.dart';
import 'package:lawbid/features/auth/domain/reauth_result.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_form_widgets.dart';
import 'package:lawbid/features/auth/presentation/widgets/us_phone_input.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// `/auth/set-password` (owner 2026-10-13): the person sets a password;
/// from then on they may sign in with it instead of a code. Owner
/// 2026-10-22 (audit #4 §2): optional, like WhatsApp / Telegram — opened
/// from Settings → «Задать пароль» while `GET /users/me` says
/// `passwordRequired` (no password yet); back closes it. Once saved the
/// screen closes and the user is reloaded.
class SetPasswordScreen extends ConsumerStatefulWidget {
  const SetPasswordScreen({super.key});

  @override
  ConsumerState<SetPasswordScreen> createState() => _SetPasswordScreenState();
}

class _SetPasswordScreenState extends ConsumerState<SetPasswordScreen> {
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  /// Owner 2026-10-22 (security audit #3): when the sign-up code was not
  /// minutes ago, the server first wants "it's me" — a code to the
  /// account's verified phone / e-mail ([_reauthTarget]); its single-use
  /// token then goes with the password.
  ({String channel, String identifier})? _reauthTarget;
  String? _reauthToken;
  int _codeAttempt = 0;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    final repo = ref.read(authRepositoryProvider);
    final result = await repo.setPassword(
      _password.text,
      reauthToken: _reauthToken,
    );
    _reauthToken = null;
    if (!mounted) return;
    if (result.status == PasswordAuthStatus.reauthRequired) {
      await _askIdentity();
      return;
    }
    if (result.isSuccess) {
      // Back to Settings first, then the reloaded user (no password
      // needed any more); opened from a link, the guard moves on.
      final users = ref.read(currentUserControllerProvider.notifier);
      final navigator = Navigator.of(context);
      if (navigator.canPop()) {
        showAppSnackBar(context, t.t('auth.setPassword.saved'));
        navigator.pop();
      }
      await users.load();
      if (!mounted) return;
    }
    setState(() {
      _busy = false;
      _error = result.isSuccess ? null : passwordErrorText(t, result);
    });
  }

  /// Sends the "it's me" code to a contact the account already has.
  Future<void> _askIdentity() async {
    final t = ref.read(translatorProvider);
    final target =
        ref.read(currentUserControllerProvider).user?.reauthIdentifier;
    if (target == null) {
      setState(() {
        _busy = false;
        _error = t.t('error.api.REAUTH_REQUIRED');
      });
      return;
    }
    try {
      await ref
          .read(authRepositoryProvider)
          .requestOtp(target.identifier, channel: target.channel);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = t.t('error.api.REAUTH_REQUIRED');
      });
      return;
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = null;
      _reauthTarget = target;
      _codeAttempt++;
    });
  }

  /// The "it's me" code → a reauth token → the password again.
  Future<void> _confirmIdentity(String code) async {
    final target = _reauthTarget;
    if (target == null || _busy) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    final result = await ref
        .read(authRepositoryProvider)
        .reauthWithOtp(identifier: target.identifier, code: code);
    if (!mounted) return;
    if (result case ReauthSuccess(:final reauthToken)) {
      _reauthToken = reauthToken;
      setState(() => _reauthTarget = null);
      await _submit();
      return;
    }
    setState(() {
      _busy = false;
      _error = t.t('error.api.REAUTH_INVALID');
      _codeAttempt++;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final target = _reauthTarget;
    return PopScope(
      canPop: !_busy,
      child: PasswordFormScaffold(
        onBack: Navigator.of(context).canPop()
            ? () => Navigator.of(context).maybePop()
            : null,
        title: t.t('auth.setPassword.title'),
        subtitle: t.t('auth.setPassword.body'),
        fields: [
          PasswordField(
            controller: _password,
            hintText: t.t('auth.setPassword.hint'),
            helperText: t.t('auth.setPassword.rule'),
            errorText: _error,
            autofocus: true,
            newPassword: true,
            textInputAction: TextInputAction.go,
            onSubmitted: (_) => isAcceptablePassword(_password.text) && !_busy
                ? _submit()
                : null,
            onChanged: (_) => setState(() => _error = null),
          ),
          if (target != null) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('account.flow.identity.body', {
                'target': target.channel == 'phone'
                    ? UsPhone.format(target.identifier)
                    : target.identifier,
              }),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppOtpField(
              key: ValueKey('reauth-$_codeAttempt'),
              semanticLabel: t.t('auth.otp.fieldLabel'),
              onCompleted: _confirmIdentity,
            ),
          ],
        ],
        bottom: AppButton(
          label: t.t('auth.setPassword.submit'),
          height: 40,
          isLoading: _busy,
          isEnabled: isAcceptablePassword(_password.text),
          onPressed: _submit,
        ),
      ),
    );
  }
}
