import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/auth_repository.dart';
import 'package:lawbid/features/auth/domain/account_deletion_result.dart';
import 'package:lawbid/features/auth/domain/reauth_result.dart';
import 'package:lawbid/features/profile/domain/delete_account_flow_state.dart';
import 'package:lawbid/features/profile/domain/delete_account_step.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'delete_account_controller.g.dart';

/// Drives `/profile/settings/delete-account` (file 01 §10.7:
/// "Настройки → Удалить аккаунт → предупреждение → повторная
/// аутентификация → подтверждение"). Phase 4 of the auth networking work
/// (docs/CHANGELOG.md), continuing directly after Phase 3 social login
/// (commit 2bbeba5).
///
/// A plain (sync) `Notifier`, not `AsyncNotifier` — unlike
/// `ActiveDevicesController`, `build()` here does no network call, only
/// [acknowledgeWarning]/[submitPhone]/[submitCode]/[submitDeletion]
/// do, and each already tracks its own [DeleteAccountFlowState.isSubmitting]
/// / [DeleteAccountFlowState.errorMessage] rather than the whole state tree
/// going through `AsyncValue`'s loading/error/data — same shape as
/// `OnboardingFlow` (features/auth/application/onboarding_flow.dart).
///
/// NOTE: this file's `.g.dart` part was NOT generated as part of this
/// change (no `dart` binary available on this bridge) — `dart run
/// build_runner build` is required before this compiles.
@riverpod
class DeleteAccountController extends _$DeleteAccountController {
  @override
  DeleteAccountFlowState build() => const DeleteAccountFlowState();

  AuthRepository get _repo => ref.read(authRepositoryProvider);

  /// Warning step's "Продолжить" — also probes biometric availability so
  /// the reauth-phone step knows whether to show the Face ID/Touch ID
  /// affordance at all.
  Future<void> acknowledgeWarning() async {
    final available =
        await ref.read(biometricAuthServiceProvider).isAvailable();
    state = state.copyWith(
      step: DeleteAccountStep.reauthPhone,
      biometricAvailable: available,
    );
  }

  /// Local biometric gate (see `BiometricAuthService`'s doc comment for
  /// exactly what this does and does not prove server-side). A success
  /// here does NOT set [DeleteAccountFlowState.reauthToken] — it cannot,
  /// the server only mints that from a correct OTP code — it only affects
  /// this controller's own UX (the screen can pre-fill trust/skip an extra
  /// tap), so callers still always go through [submitPhone]/[submitCode]
  /// afterward.
  Future<bool> tryBiometric({required String reason}) {
    return ref.read(biometricAuthServiceProvider).authenticate(reason: reason);
  }

  /// Reauth-phone step: requests an OTP for [phoneNumber] (E.164) via the
  /// existing public `POST /auth/otp/request` (reused, not a new
  /// endpoint — see `AuthRepository.reauthWithOtp`'s doc comment) and
  /// advances to the code step. Errors here are network-only (the
  /// endpoint doesn't reveal whether the number belongs to an account,
  /// same anti-enumeration behavior as login) — a bad/foreign number just
  /// surfaces once [submitCode] gets back `REAUTH_INVALID`.
  Future<void> submitPhone(String phoneNumber) async {
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    try {
      await _repo.requestOtp(phoneNumber);
      state = state.copyWith(
        phoneNumber: phoneNumber,
        codeRequested: true,
        isSubmitting: false,
        step: DeleteAccountStep.reauthCode,
      );
    } catch (_) {
      state = state.copyWith(isSubmitting: false, errorMessage: 'network');
    }
  }

  /// Reauth-code step: exchanges [code] for a `reauthToken` via
  /// `POST /auth/reauth`. On success, advances straight to
  /// [DeleteAccountStep.confirmPhrase] — the reauth token is now armed
  /// (single-use, 5-minute TTL server-side; see `ReauthGuard`'s doc
  /// comment in apps/api) for the [submitDeletion] call at the end of that
  /// step.
  Future<void> submitCode(String code) async {
    final phone = state.phoneNumber;
    if (phone == null) return;
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    final result = await _repo.reauthWithOtp(identifier: phone, code: code);
    result.when(
      success: (reauthToken) {
        state = state.copyWith(
          reauthToken: reauthToken,
          isSubmitting: false,
          step: DeleteAccountStep.confirmPhrase,
        );
      },
      invalid: () {
        state = state.copyWith(isSubmitting: false, errorMessage: 'invalid');
      },
      rateLimited: (_) {
        state = state.copyWith(isSubmitting: false, errorMessage: 'network');
      },
      networkError: () {
        state = state.copyWith(isSubmitting: false, errorMessage: 'network');
      },
    );
  }

  /// Confirm-phrase step: tracks the person's typed input so the screen
  /// can enable the final delete button only once it matches exactly
  /// (case-sensitive — the screen shows the expected phrase, no ambiguity
  /// to be lenient about).
  void confirmPhraseChanged(String value) {
    state = state.copyWith(confirmPhraseInput: value, errorMessage: null);
  }

  /// Final step: `DELETE /users/me` with the armed [DeleteAccountFlowState.
  /// reauthToken]. On success the repository has already cleared local
  /// session state (see `RealAuthRepository.deleteAccount`'s doc
  /// comment) — this only updates [DeleteAccountFlowState.step] to
  /// [DeleteAccountStep.done] so the screen can show the grace-period
  /// message before the caller navigates to Welcome.
  Future<bool> submitDeletion() async {
    final token = state.reauthToken;
    if (token == null) return false;
    state = state.copyWith(
      isSubmitting: true,
      errorMessage: null,
      step: DeleteAccountStep.submitting,
    );
    final result = await _repo.deleteAccount(reauthToken: token);
    var succeeded = false;
    result.when(
      success: () {
        succeeded = true;
        state =
            state.copyWith(isSubmitting: false, step: DeleteAccountStep.done);
      },
      // Both reauthRequired and reauthInvalid mean the armed token expired
      // or was already used (5-minute TTL, single-use — ReauthGuard)
      // between confirmPhrase and here — send the person back to get a
      // fresh one rather than dead-ending.
      reauthRequired: () {
        state = state.copyWith(
          isSubmitting: false,
          reauthToken: null,
          errorMessage: 'reauthExpired',
          step: DeleteAccountStep.reauthPhone,
        );
      },
      reauthInvalid: () {
        state = state.copyWith(
          isSubmitting: false,
          reauthToken: null,
          errorMessage: 'reauthExpired',
          step: DeleteAccountStep.reauthPhone,
        );
      },
      networkError: () {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: 'network',
          step: DeleteAccountStep.confirmPhrase,
        );
      },
    );
    return succeeded;
  }
}
