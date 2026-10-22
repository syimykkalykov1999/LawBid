import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/domain/login_identifier.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_form_widgets.dart';
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
    final result =
        await ref.read(authRepositoryProvider).setPassword(_password.text);
    if (!mounted) return;
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

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
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
