import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/application/passkeys_providers.dart';
import 'package:lawbid/features/auth/data/passkey_authenticator.dart';
import 'package:lawbid/features/auth/presentation/widgets/passkeys_section.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-24 (attorney passkey nudge): once after sign-in, an
/// attorney or an assistant who has no passkey yet is offered
/// «Защитите вход: Face ID / отпечаток». «Включить» runs the same enrolment
/// as Settings → Devices → Sign-in keys; «Позже» snoozes it for 7 days, at
/// most 3 times, and then it never comes back. Kept on this phone (there is
/// no per-user preferences place on the server, and an account that gets a
/// key on any device is never asked again - the list is read first).
class PasskeyNudgePolicy {
  const PasskeyNudgePolicy(this._prefs, this.userId);

  final SharedPreferences _prefs;
  final String userId;

  /// How long «Позже» hides the offer.
  static const snooze = Duration(days: 7);

  /// After this many «Позже» the offer is retired.
  static const maxSnoozes = 3;

  /// An offer shown but not answered (app killed) hides it for a day.
  static const unansweredHide = Duration(days: 1);

  String get _until => 'passkey_nudge.until.$userId';
  String get _count => 'passkey_nudge.count.$userId';
  String get _done => 'passkey_nudge.done.$userId';

  bool due(DateTime now) {
    if (_prefs.getBool(_done) ?? false) return false;
    if ((_prefs.getInt(_count) ?? 0) >= maxSnoozes) return false;
    final until = _prefs.getInt(_until);
    return until == null ||
        !now.isBefore(DateTime.fromMillisecondsSinceEpoch(until));
  }

  Future<void> shown(DateTime now) => _prefs.setInt(
        _until,
        now.add(unansweredHide).millisecondsSinceEpoch,
      );

  Future<void> later(DateTime now) async {
    await _prefs.setInt(_until, now.add(snooze).millisecondsSinceEpoch);
    await _prefs.setInt(_count, (_prefs.getInt(_count) ?? 0) + 1);
  }

  Future<void> enabled() => _prefs.setBool(_done, true);
}

final passkeyNudgePolicyProvider = Provider<PasskeyNudgePolicy?>((ref) {
  final id = ref.watch(sessionControllerProvider.select((s) => s?.sub));
  if (id == null) return null;
  return PasskeyNudgePolicy(ref.watch(sharedPreferencesProvider), id);
});

/// Shows the offer if it is due. Never throws; the login screen is not
/// touched. Hidden where passkeys are unavailable (flag off, device
/// without support, the web without WebAuthn).
Future<void> maybeShowPasskeyNudge(BuildContext context, WidgetRef ref) async {
  try {
    final role = ref.read(currentUserRoleProvider);
    if (role != UserRole.attorney && role != UserRole.assistant) return;
    final policy = ref.read(passkeyNudgePolicyProvider);
    final now = DateTime.now();
    if (policy == null || !policy.due(now)) return;
    if (!await ref.read(passkeysAvailableProvider.future)) return;
    // Any key on the account (any device) = nothing to offer.
    final keys = await ref.read(passkeysRepositoryProvider).list();
    if (keys.isNotEmpty) {
      await policy.enabled();
      return;
    }
    if (!context.mounted) return;
    await policy.shown(now);
    if (!context.mounted) return;
    final enable = await showAppBottomSheet<bool>(
      context: context,
      builder: (_) => const PasskeyNudgeSheet(),
    );
    if (enable != true) await policy.later(DateTime.now());
  } on Object {
    // A nudge must never hurt the screen it appears on.
  }
}

class PasskeyNudgeSheet extends ConsumerStatefulWidget {
  const PasskeyNudgeSheet({super.key});

  @override
  ConsumerState<PasskeyNudgeSheet> createState() => _PasskeyNudgeSheetState();
}

class _PasskeyNudgeSheetState extends ConsumerState<PasskeyNudgeSheet> {
  bool _busy = false;
  String? _error;

  Future<void> _enable() async {
    if (_busy) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(passkeysRepositoryProvider).add();
      await ref.read(passkeyNudgePolicyProvider)?.enabled();
      if (!mounted) return;
      showAppSnackBar(context, t.t('passkey.added'));
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      // A cancelled system sheet is not an error: «Later» semantics.
      if (e is PasskeyAuthenticatorException &&
          e.failure == PasskeyFailure.cancelled) {
        Navigator.of(context).pop(false);
        return;
      }
      setState(() {
        _busy = false;
        _error = passkeyErrorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.md),
            const Center(
              child: AppIconMedallion(
                icon: AppIcons.fingerprint,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('passkey.nudge.title'),
              textAlign: TextAlign.center,
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('passkey.nudge.body'),
              textAlign: TextAlign.center,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                _error!,
                key: const ValueKey('passkey-nudge-error'),
                textAlign: TextAlign.center,
                style: type.bodySmall.copyWith(color: colors.danger),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('passkey-nudge-enable'),
              label: t.t('passkey.nudge.enable'),
              icon: AppIcons.fingerprint,
              isLoading: _busy,
              onPressed: _enable,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('passkey-nudge-later'),
              label: t.t('passkey.nudge.later'),
              variant: AppButtonVariant.secondary,
              onPressed: _busy ? null : () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}
