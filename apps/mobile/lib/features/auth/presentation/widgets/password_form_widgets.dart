import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/auth/domain/password_auth_result.dart';

/// Owner 2026-10-13: the shared frame of the password screens (log in,
/// set a password, forgot password): optional back arrow, a 20sp title, a
/// 14sp line under it, the fields, and the action pinned to the bottom
/// (scrolls with the keyboard / large text instead of clipping).
class PasswordFormScaffold extends ConsumerWidget {
  const PasswordFormScaffold({
    required this.title,
    required this.fields,
    required this.bottom,
    this.subtitle,
    this.onBack,
    super.key,
  });

  final String title;
  final String? subtitle;
  final VoidCallback? onBack;
  final List<Widget> fields;
  final Widget bottom;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Stack(
          children: [
            const PositionedDirectional(
              end: -40,
              bottom: 70,
              child: WatermarkScales(),
            ),
            LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 8),
                        if (onBack != null)
                          AppBackButton(
                            semanticLabel: t.t('common.back'),
                            onPressed: onBack!,
                          )
                        else
                          const SizedBox(height: 40),
                        const SizedBox(height: 14),
                        Semantics(
                          header: true,
                          child: Text(
                            title,
                            style: typography.titleLarge
                                .copyWith(color: colors.text, fontSize: 20),
                          ),
                        ),
                        if (subtitle != null) ...[
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            subtitle!,
                            style: typography.body
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                        const SizedBox(height: 18),
                        ...fields,
                        Padding(
                          padding: const EdgeInsets.only(bottom: 22, top: 16),
                          child: bottom,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A password field with the show / hide eye (owner 2026-10-13).
class PasswordField extends ConsumerStatefulWidget {
  const PasswordField({
    required this.controller,
    required this.hintText,
    required this.onChanged,
    this.errorText,
    this.helperText,
    this.autofocus = false,
    this.newPassword = false,
    this.textInputAction,
    this.onSubmitted,
    super.key,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;
  final String? errorText;
  final String? helperText;
  final bool autofocus;

  /// Hints the keyboard / password manager that this is a NEW password.
  final bool newPassword;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  ConsumerState<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends ConsumerState<PasswordField> {
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    return AppTextField(
      controller: widget.controller,
      hintText: widget.hintText,
      errorText: widget.errorText,
      helperText: widget.helperText,
      autofocus: widget.autofocus,
      obscureText: !_visible,
      keyboardType: TextInputType.visiblePassword,
      semanticLabel: widget.hintText,
      autofillHints: [
        if (widget.newPassword)
          AutofillHints.newPassword
        else
          AutofillHints.password,
      ],
      textInputAction: widget.textInputAction,
      onSubmitted: widget.onSubmitted,
      onChanged: widget.onChanged,
      trailing: IconButton(
        tooltip: t.t(_visible ? 'auth.password.hide' : 'auth.password.show'),
        onPressed: () => setState(() => _visible = !_visible),
        icon: Icon(
          _visible
              ? AppIcons.visibilityOffOutlined
              : AppIcons.visibilityOutlined,
          size: 20,
          color: colors.textSecondary,
        ),
      ),
    );
  }
}

/// The translation key of the message for a failed password operation.
String passwordErrorKey(PasswordAuthStatus status) => switch (status) {
      PasswordAuthStatus.success => '',
      PasswordAuthStatus.invalidCredentials =>
        'error.api.AUTH_INVALID_CREDENTIALS',
      PasswordAuthStatus.invalidCode => 'error.api.AUTH_OTP_INVALID',
      PasswordAuthStatus.expired => 'error.api.AUTH_OTP_EXPIRED',
      PasswordAuthStatus.locked => 'error.api.AUTH_OTP_LOCKED',
      PasswordAuthStatus.rateLimited => 'error.api.RATE_LIMITED',
      PasswordAuthStatus.unavailable => 'error.api.ACCOUNT_SUSPENDED',
      PasswordAuthStatus.providerDisabled => 'error.api.AUTH_PROVIDER_DISABLED',
      PasswordAuthStatus.reauthRequired => 'error.api.REAUTH_REQUIRED',
      PasswordAuthStatus.networkError => 'error.api.NETWORK_ERROR',
    };

String passwordErrorText(Translator t, PasswordAuthResult result) =>
    t.t(passwordErrorKey(result.status));
