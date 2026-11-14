import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// app_config key of the wait between two SMS codes to one number (admin:
/// «SMS» → `sms.resend_cooldown_seconds`, the same value the server
/// enforces). 0 = no wait.
const kSmsResendCooldownConfig = 'sms.resend_cooldown_seconds';

/// The spec default when the bootstrap has not arrived yet.
const kSmsResendCooldownDefault = 60;

/// «Resend in 0:59» → «Resend» (WhatsApp / Telegram). Moved from the code
/// screen so the «Forgot password» screen counts down too (Detective R2-A
/// #17); the wait is the admin's, not a number in the app.
class ResendCountdown extends ConsumerStatefulWidget {
  const ResendCountdown({
    required this.t,
    required this.onResend,
    this.label,
    super.key,
  });

  final Translator t;

  /// True when the code was re-sent (the countdown restarts only then).
  final Future<bool> Function() onResend;

  /// The link's text; `auth.otp.resend` by default.
  final String? label;

  @override
  ConsumerState<ResendCountdown> createState() => _ResendCountdownState();
}

class _ResendCountdownState extends ConsumerState<ResendCountdown> {
  Timer? _timer;
  int _remaining = 0;
  bool _resending = false;

  int get _totalSeconds {
    final v = ref
        .read(featureFlagsControllerProvider)
        .configInt(kSmsResendCooldownConfig, kSmsResendCooldownDefault);
    return v < 0 ? 0 : v;
  }

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    final total = _totalSeconds;
    setState(() => _remaining = total);
    if (total <= 0) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_remaining <= 1) {
        timer.cancel();
        setState(() => _remaining = 0);
      } else {
        setState(() => _remaining -= 1);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final label = widget.label ?? widget.t.t('auth.otp.resend');

    if (_remaining > 0) {
      final minutes = _remaining ~/ 60;
      final seconds = (_remaining % 60).toString().padLeft(2, '0');
      final text =
          widget.t.t('auth.otp.resendIn', {'time': '$minutes:$seconds'});
      // Fast-updating (1/sec) text — excluded from the semantics tree so a
      // screen reader doesn't re-announce it every second (a11y review,
      // docs/CHANGELOG.md stage 1.7). The static link below IS announced
      // once it appears.
      return ExcludeSemantics(
        child: Text(
          text,
          key: const ValueKey('resend-countdown'),
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
      );
    }

    return GestureDetector(
      key: const ValueKey('resend-link'),
      onTap: () async {
        if (_resending) return;
        _resending = true;
        final sent = await widget.onResend();
        _resending = false;
        if (sent && mounted) _startTimer();
      },
      child: Semantics(
        button: true,
        label: label,
        child: ExcludeSemantics(
          child: Text(
            label,
            style: typography.caption.copyWith(
              color: colors.goldText,
              decoration: TextDecoration.underline,
            ),
          ),
        ),
      ),
    );
  }
}
