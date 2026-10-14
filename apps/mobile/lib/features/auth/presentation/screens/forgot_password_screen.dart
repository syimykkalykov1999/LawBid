import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/login_identifier.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart'
    show SwitchChannelLink;
import 'package:lawbid/features/auth/presentation/widgets/password_form_widgets.dart';

/// `/auth/forgot-password` (owner 2026-10-13): step 1 asks for the phone
/// number and sends the code by SMS (owner 2026-10-14: never to an e-mail);
/// step 2 takes the code and a new password and signs the person in.
/// [initialIdentifier] is what they had typed on the sign-in screen.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({this.initialIdentifier = '', super.key});

  final String initialIdentifier;

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  late final _identifier =
      TextEditingController(text: widget.initialIdentifier);
  final _code = TextEditingController();
  final _password = TextEditingController();
  LoginIdentifier? _sentTo;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _codeStep => _sentTo != null;

  Future<void> _sendCode() async {
    final t = ref.read(translatorProvider);
    // Owner 2026-10-14: a forgotten password is reset by SMS to the phone
    // number only — no e-mail anywhere on this screen.
    final id = LoginIdentifier.tryParse(_identifier.text);
    if (id == null || id.isEmail) {
      setState(() => _error = t.t('auth.forgot.error.phone'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final result =
        await ref.read(authRepositoryProvider).requestPasswordReset(id.value);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (result.isSuccess) {
        _sentTo = id;
        _code.clear();
      } else {
        _error = passwordErrorText(t, result);
      }
    });
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    final result = await ref.read(authRepositoryProvider).resetPassword(
          identifier: _sentTo!.value,
          code: _code.text,
          newPassword: _password.text,
        );
    if (!mounted) return;
    // Success: the session exists, the router guard moves on.
    setState(() {
      _busy = false;
      _error = result.isSuccess ? null : passwordErrorText(t, result);
    });
  }

  bool get _canSave =>
      _code.text.length == 6 && isAcceptablePassword(_password.text);

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    return PasswordFormScaffold(
      title: t.t('auth.forgot.title'),
      subtitle:
          _codeStep ? t.t('auth.forgot.sentPhone') : t.t('auth.forgot.body'),
      onBack: () {
        if (_codeStep && !_busy) {
          setState(() {
            _sentTo = null;
            _error = null;
          });
        } else if (context.canPop()) {
          context.pop();
        } else {
          context.go(AuthRoutes.login);
        }
      },
      fields: _codeStep
          ? [
              AppTextField(
                controller: _code,
                hintText: t.t('auth.forgot.code.hint'),
                semanticLabel: t.t('auth.forgot.code.hint'),
                keyboardType: TextInputType.number,
                autofocus: true,
                maxLength: 6,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                textInputAction: TextInputAction.next,
                onChanged: (_) => setState(() => _error = null),
              ),
              const SizedBox(height: AppSpacing.md),
              PasswordField(
                controller: _password,
                hintText: t.t('auth.forgot.newPassword.hint'),
                helperText: t.t('auth.setPassword.rule'),
                errorText: _error,
                newPassword: true,
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _canSave && !_busy ? _save() : null,
                onChanged: (_) => setState(() => _error = null),
              ),
              const SizedBox(height: AppSpacing.md),
              SwitchChannelLink(
                label: t.t('auth.forgot.resend'),
                onTap: _busy ? () {} : _sendCode,
              ),
            ]
          : [
              AppTextField(
                controller: _identifier,
                hintText: t.t('auth.forgot.phone.hint'),
                semanticLabel: t.t('auth.forgot.phone.hint'),
                errorText: _error,
                keyboardType: TextInputType.phone,
                autofocus: true,
                autofillHints: const [AutofillHints.username],
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _sendCode(),
                onChanged: (_) => setState(() => _error = null),
              ),
            ],
      bottom: _codeStep
          ? AppButton(
              label: t.t('auth.forgot.submit'),
              height: 40,
              isLoading: _busy,
              isEnabled: _canSave,
              onPressed: _save,
            )
          : AppButton(
              label: t.t('auth.forgot.send'),
              height: 40,
              isLoading: _busy,
              isEnabled: _identifier.text.trim().isNotEmpty,
              onPressed: _sendCode,
            ),
    );
  }
}
