import 'dart:convert';

import '../../../core/persistence/local_kv_store.dart';
import '../domain/onboarding_step.dart';

const _kOnboardingProgressKey = 'auth.onboarding_progress';

/// Persists ONLY `{step, phoneNumber}` (file 01 §15 stage-1.7 acceptance
/// item 4: "Закрытие приложения на середине онбординга и продолжение с
/// того же шага"). The OTP code itself is NEVER persisted here — it only
/// ever lives in the hidden `TextField`'s in-memory controller
/// (`AppOtpField`) and `OnboardingFlow`'s call stack for the duration of one
/// `verifyOtp` call.
class OnboardingLocalStore {
  const OnboardingLocalStore(this._kv);

  final LocalKvStore _kv;

  Future<void> save({required OnboardingStep step, String? phoneNumber}) {
    final payload = jsonEncode({'step': step.name, 'phoneNumber': phoneNumber});
    return _kv.setString(_kOnboardingProgressKey, payload);
  }

  ({OnboardingStep step, String? phoneNumber})? read() {
    final raw = _kv.getString(_kOnboardingProgressKey);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final stepName = decoded['step'] as String?;
      final step = OnboardingStep.values.asNameMap()[stepName];
      if (step == null) return null;
      return (step: step, phoneNumber: decoded['phoneNumber'] as String?);
    } catch (_) {
      // Corrupt/unrecognized payload (e.g. a future app version's shape) —
      // treat as "no saved progress" rather than crash on cold start.
      return null;
    }
  }

  Future<void> clear() => _kv.remove(_kOnboardingProgressKey);
}
