import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/login_identifier.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart'
    show SwitchChannelLink;
import 'package:lawbid/features/auth/presentation/widgets/password_form_widgets.dart';

/// `/auth/login` (owner 2026-10-13): sign in with a phone number or e-mail
/// and the password — no SMS. After a successful call the session exists
/// and the router guard moves on (feed, or the step onboarding still
/// needs); this screen does not navigate.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({this.initialIdentifier = '', super.key});

  /// The number typed on the phone screen (the password is asked next).
  final String initialIdentifier;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  late final _identifier =
      TextEditingController(text: widget.initialIdentifier);
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _filled =>
      _identifier.text.trim().isNotEmpty && _password.text.isNotEmpty;

  Future<void> _submit() async {
    final t = ref.read(translatorProvider);
    final id = LoginIdentifier.tryParse(_identifier.text);
    if (id == null) {
      setState(() => _error = t.t('auth.login.error.identifier'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final result = await ref
        .read(authRepositoryProvider)
        .signInWithPassword(identifier: id.value, password: _password.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = result.isSuccess ? null : passwordErrorText(t, result);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return PasswordFormScaffold(
      title: t.t('auth.login.title'),
      subtitle: t.t('auth.login.subtitle'),
      onBack: () {
        ref
            .read(onboardingFlowProvider.notifier)
            .goBackTo(OnboardingStep.welcome);
        if (context.canPop()) {
          context.pop();
        } else {
          context.go(AuthRoutes.welcome);
        }
      },
      fields: [
        AppTextField(
          controller: _identifier,
          hintText: t.t('auth.login.identifier.hint'),
          semanticLabel: t.t('auth.login.identifier.hint'),
          keyboardType: TextInputType.emailAddress,
          autofocus: widget.initialIdentifier.isEmpty,
          autofillHints: const [AutofillHints.username],
          textInputAction: TextInputAction.next,
          onChanged: (_) => setState(() => _error = null),
        ),
        const SizedBox(height: AppSpacing.md),
        PasswordField(
          controller: _password,
          hintText: t.t('auth.login.password.hint'),
          errorText: _error,
          autofocus: widget.initialIdentifier.isNotEmpty,
          textInputAction: TextInputAction.go,
          onSubmitted: (_) => _filled && !_busy ? _submit() : null,
          onChanged: (_) => setState(() => _error = null),
        ),
        const SizedBox(height: AppSpacing.md),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: SwitchChannelLink(
            label: t.t('auth.login.forgot'),
            onTap: () => context.push(
              AuthRoutes.forgotPassword,
              extra: _identifier.text.trim(),
            ),
          ),
        ),
      ],
      bottom: Column(
        children: [
          AppButton(
            label: t.t('auth.login.submit'),
            height: 40,
            isLoading: _busy,
            isEnabled: _filled,
            onPressed: _submit,
          ),
          const SizedBox(height: AppSpacing.sm),
          TextButton(
            key: const ValueKey('login-create-account'),
            onPressed: () {
              ref.read(onboardingFlowProvider.notifier).goToPhoneStep();
              context.pushReplacement(AuthRoutes.phone);
            },
            child: Text(
              t.t('auth.login.create'),
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}
