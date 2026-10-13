import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/domain/login_identifier.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_form_widgets.dart';

/// `/auth/change-password` (Settings, owner 2026-10-13): the current
/// password and a new one. The server checks the current one and ends the
/// other sessions.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  bool get _ready =>
      _current.text.isNotEmpty && isAcceptablePassword(_next.text);

  Future<void> _submit() async {
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    final result = await ref
        .read(authRepositoryProvider)
        .setPassword(_next.text, currentPassword: _current.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = result.isSuccess ? null : passwordErrorText(t, result);
    });
    if (result.isSuccess) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(t.t('auth.change.done'))));
      if (context.canPop()) context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    return PasswordFormScaffold(
      title: t.t('auth.change.title'),
      subtitle: t.t('auth.change.body'),
      onBack: () => context.pop(),
      fields: [
        PasswordField(
          controller: _current,
          hintText: t.t('auth.change.current.hint'),
          autofocus: true,
          textInputAction: TextInputAction.next,
          onChanged: (_) => setState(() => _error = null),
        ),
        const SizedBox(height: 12),
        PasswordField(
          controller: _next,
          hintText: t.t('auth.change.new.hint'),
          helperText: t.t('auth.setPassword.rule'),
          errorText: _error,
          newPassword: true,
          textInputAction: TextInputAction.go,
          onSubmitted: (_) => _ready && !_busy ? _submit() : null,
          onChanged: (_) => setState(() => _error = null),
        ),
      ],
      bottom: AppButton(
        label: t.t('auth.change.submit'),
        height: 40,
        isLoading: _busy,
        isEnabled: _ready,
        onPressed: _submit,
      ),
    );
  }
}
