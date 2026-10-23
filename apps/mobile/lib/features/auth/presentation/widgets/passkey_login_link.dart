import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/diagnostics/app_event_names.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/passkeys_providers.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart'
    show SwitchChannelLink;
import 'package:lawbid/features/auth/presentation/widgets/passkeys_section.dart';

/// «Face ID / fingerprint» (owner 2026-10-23): the passkey sign-in as a
/// plain text link on the Log in screen, on the row of «Forgot password?»
/// and styled like it. Shown only when passkeys are on and the device can
/// use them (the same check the Welcome screen's button used). The system
/// passkey sheet opens; a cancel says nothing, every other outcome is one
/// line.
class PasskeyLoginLink extends ConsumerStatefulWidget {
  const PasskeyLoginLink({super.key});

  @override
  ConsumerState<PasskeyLoginLink> createState() => _PasskeyLoginLinkState();
}

class _PasskeyLoginLinkState extends ConsumerState<PasskeyLoginLink> {
  bool _busy = false;

  Future<void> _signIn() async {
    if (_busy || !(ModalRoute.of(context)?.isCurrent ?? true)) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    final result = await ref.read(passkeysRepositoryProvider).signIn();
    AppEvents.track(
      result.isSuccess
          ? AppEventNames.loginSuccess
          : AppEventNames.loginFailure,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (result.isSuccess || result.status == PasskeySignInStatus.cancelled) {
      return; // the router guard moves a signed-in person on
    }
    final text = switch (result.status) {
      PasskeySignInStatus.noCredentials => t.t('passkey.error.noCredentials'),
      PasskeySignInStatus.unsupported => t.t('passkey.error.unsupported'),
      _ => result.error == null
          ? t.t('passkey.error.generic')
          : passkeyErrorText(t, result.error!),
    };
    showAppSnackBar(context, text);
  }

  @override
  Widget build(BuildContext context) {
    if (!(ref.watch(passkeysAvailableProvider).value ?? false)) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    return SwitchChannelLink(
      key: const ValueKey('login-passkey'),
      label: t.t('passkey.signIn.short'),
      alignment: AlignmentDirectional.centerEnd,
      textAlign: TextAlign.end,
      onTap: _signIn,
    );
  }
}
