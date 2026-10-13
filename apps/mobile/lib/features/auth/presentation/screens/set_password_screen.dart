import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/domain/login_identifier.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_form_widgets.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// `/auth/set-password` (owner 2026-10-13): right after the one SMS code
/// the person sets a password; from then on they sign in with it, no SMS.
/// The router guard shows this screen while `GET /users/me` says
/// `passwordRequired`, so it cannot be skipped; once the password is saved
/// the user is reloaded and the guard moves on.
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
      // The reloaded user no longer needs a password: the guard moves on.
      await ref.read(currentUserControllerProvider.notifier).load();
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
      canPop: false,
      child: PasswordFormScaffold(
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
