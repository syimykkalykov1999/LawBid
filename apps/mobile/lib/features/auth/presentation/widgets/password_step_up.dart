import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/route_observer.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/application/passkeys_providers.dart';
import 'package:lawbid/features/auth/domain/password_reauth_outcome.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart'
    show SwitchChannelLink;
import 'package:lawbid/features/auth/presentation/widgets/password_form_widgets.dart';

/// Whether to offer «Face ID / отпечаток» on the password step-up: the
/// device supports passkeys and this account has one (the key lives in the
/// phone's secure storage; the server checks its signature —
/// `POST /auth/passkeys/reauth`). Any failure just hides the button.
final stepUpPasskeyProvider = FutureProvider.autoDispose<bool>((ref) async {
  try {
    if (!await ref.watch(passkeysAvailableProvider.future)) return false;
    final keys = await ref.watch(passkeysRepositoryProvider).list();
    return keys.isNotEmpty;
  } on Object {
    return false;
  }
});

/// Owner 2026-10-28: «Подтвердите, что это вы» with the ACCOUNT PASSWORD
/// (an SMS costs money). A password field with show / hide, «Подтвердить»,
/// the device's Face ID / fingerprint when the account has a passkey, and
/// «Забыли пароль? Получить код по SMS» which hands over to the screen's
/// code path ([onUseCode]). The server's «no password / passkey only / I
/// only know codes (older server)» answers go to [onUseCode] on their own.
class PasswordStepUp extends ConsumerStatefulWidget {
  const PasswordStepUp({
    required this.onToken,
    required this.onUseCode,
    this.autofocus = true,
    super.key,
  });

  /// The single-use reauth token (5 minutes), same as the code path's.
  final Future<void> Function(String reauthToken) onToken;
  final VoidCallback onUseCode;
  final bool autofocus;

  @override
  ConsumerState<PasswordStepUp> createState() => _PasswordStepUpState();
}

class _PasswordStepUpState extends ConsumerState<PasswordStepUp> {
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final password = _password.text;
    if (_busy || password.isEmpty) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    final outcome =
        await ref.read(authRepositoryProvider).reauthWithPassword(password);
    if (!mounted) return;
    switch (outcome) {
      case PasswordReauthOk(:final reauthToken):
        dropKeyboard();
        await widget.onToken(reauthToken);
        if (mounted) setState(() => _busy = false);
      case PasswordReauthWrong():
        setState(() {
          _busy = false;
          _error = t.t('stepUp.password.wrong');
        });
      case PasswordReauthLocked():
        setState(() {
          _busy = false;
          _error = t.t('stepUp.password.locked');
        });
      case PasswordReauthUseCode():
        setState(() => _busy = false);
        widget.onUseCode();
      case PasswordReauthNetworkError():
        setState(() {
          _busy = false;
          _error = t.t('offline.message');
        });
    }
  }

  Future<void> _passkey() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    String? token;
    try {
      token = await ref.read(passkeysRepositoryProvider).reauth();
    } on Object {
      token = null;
    }
    if (!mounted) return;
    if (token == null) {
      setState(() => _busy = false);
      return;
    }
    await widget.onToken(token);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final passkey = ref.watch(stepUpPasskeyProvider).value ?? false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        PasswordField(
          key: const ValueKey('step-up-password'),
          controller: _password,
          hintText: t.t('auth.login.password.hint'),
          errorText: _error,
          autofocus: widget.autofocus,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton(
          key: const ValueKey('step-up-password-submit'),
          label: t.t('stepUp.password.submit'),
          isLoading: _busy,
          onPressed: _submit,
        ),
        if (passkey) ...[
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            key: const ValueKey('step-up-passkey'),
            label: t.t('passkey.signIn.short'),
            variant: AppButtonVariant.secondary,
            isEnabled: !_busy,
            onPressed: _passkey,
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
        SwitchChannelLink(
          key: const ValueKey('step-up-use-code'),
          label: t.t('stepUp.useCode'),
          alignment: AlignmentDirectional.center,
          textAlign: TextAlign.center,
          onTap: () {
            if (_busy) return;
            dropKeyboard();
            widget.onUseCode();
          },
        ),
      ],
    );
  }
}
