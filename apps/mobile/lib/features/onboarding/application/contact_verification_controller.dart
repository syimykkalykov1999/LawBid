import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';

enum ContactVerificationStage {
  /// Entering the phone/email.
  editing,

  /// Only when REPLACING an already-verified contact of this type: the
  /// backend requires a fresh reauth token, so a login code was sent to
  /// the account's verified contact and the user types it here first.
  confirmIdentity,

  /// The code for the NEW contact was sent; waiting for it.
  codeSent,

  /// Done — `GET /users/me` now reports it verified.
  verified,
}

@immutable
class ContactVerificationState {
  const ContactVerificationState({
    this.stage = ContactVerificationStage.editing,
    this.value,
    this.reauthTarget,
    this.busy = false,
    this.error,
    this.attempt = 0,
  });

  final ContactVerificationStage stage;

  /// Normalized phone (E.164) / email being verified.
  final String? value;

  /// The existing verified contact the identity code went to.
  final String? reauthTarget;
  final bool busy;
  final Object? error;

  /// Bumped on every code (re)send — the inline OTP field keys its reset
  /// and resend countdown on it.
  final int attempt;

  ContactVerificationState copyWith({
    ContactVerificationStage? stage,
    String? value,
    String? reauthTarget,
    bool? busy,
    Object? error,
    bool clearError = false,
    int? attempt,
  }) =>
      ContactVerificationState(
        stage: stage ?? this.stage,
        value: value ?? this.value,
        reauthTarget: reauthTarget ?? this.reauthTarget,
        busy: busy ?? this.busy,
        error: clearError ? null : (error ?? this.error),
        attempt: attempt ?? this.attempt,
      );
}

/// Synthetic error code: the account has no verified contact a reauth
/// code could be sent to (should not happen after an OTP/social sign-in).
const kNoReauthContactCode = 'NO_REAUTH_CONTACT';

/// Inline verification of one contact on the onboarding contacts step
/// (docs/01_FOUNDATION_AUTH.md §11 Шаг 3A/3B, §10.5):
///
///   first contact:  editing ──send──▶ codeSent ──code──▶ verified
///   replacement:    editing ──send──▶ confirmIdentity ──code──▶ codeSent ──▶ …
///
/// Adding the FIRST contact of a type sends its code directly. Replacing
/// an already-verified one needs reauth (docs/01 §11 step 3A): the
/// identity code goes to the contact the user signed in with, via
/// `POST /auth/otp/request` + `POST /auth/reauth`; the token is single-use,
/// so each replacement (re)send needs a fresh identity confirmation.
class ContactVerificationController extends Notifier<ContactVerificationState> {
  ContactVerificationController(this.type);

  final ContactType type;

  @override
  ContactVerificationState build() => const ContactVerificationState();

  Future<void> _guard(Future<void> Function() body) async {
    if (state.busy) return;
    state = state.copyWith(busy: true, clearError: true);
    try {
      await body();
      if (ref.mounted) state = state.copyWith(busy: false);
    } catch (e) {
      if (ref.mounted) state = state.copyWith(busy: false, error: e);
    }
  }

  /// Step 1: sends the code to [value] directly for a first contact, or
  /// starts identity confirmation when replacing a verified one.
  Future<void> sendCode(String value) => _guard(() async {
        final me = ref.read(currentUserControllerProvider).user;
        final alreadyVerified = type == ContactType.phone
            ? (me?.phoneVerified ?? false)
            : (me?.emailVerified ?? false);
        if (!alreadyVerified) {
          try {
            await ref
                .read(onboardingRepositoryProvider)
                .requestContactCode(type: type, value: value);
          } on ApiException {
            state = state.copyWith(
              stage: ContactVerificationStage.editing,
              value: value,
            );
            rethrow;
          }
          state = state.copyWith(
            stage: ContactVerificationStage.codeSent,
            value: value,
            attempt: state.attempt + 1,
          );
          return;
        }
        final target = me?.reauthIdentifier;
        if (target == null) {
          throw const ApiException(
            code: kNoReauthContactCode,
            message: 'No verified contact',
          );
        }
        await ref.read(onboardingRepositoryProvider).requestReauthCode(
              channel: target.channel,
              identifier: target.identifier,
            );
        state = state.copyWith(
          stage: ContactVerificationStage.confirmIdentity,
          value: value,
          reauthTarget: target.identifier,
          attempt: state.attempt + 1,
        );
      });

  /// Step 2: exchanges the identity code for a reauth token and sends the
  /// code to the new contact. A rejected contact (blocked domain, already
  /// used, unsupported country, budget) returns to editing with the error.
  Future<void> confirmIdentity(String code) => _guard(() async {
        final value = state.value;
        final target = state.reauthTarget;
        if (value == null || target == null) return;
        final repo = ref.read(onboardingRepositoryProvider);
        final token = await repo.reauth(identifier: target, code: code);
        try {
          await repo.requestContactCode(
            type: type,
            value: value,
            reauthToken: token,
          );
        } on ApiException {
          state = state.copyWith(stage: ContactVerificationStage.editing);
          rethrow;
        }
        state = state.copyWith(
          stage: ContactVerificationStage.codeSent,
          attempt: state.attempt + 1,
        );
      });

  /// Step 3: verifies the new contact, then refreshes `GET /users/me`.
  Future<void> verify(String code) => _guard(() async {
        final value = state.value;
        if (value == null) return;
        await ref
            .read(onboardingRepositoryProvider)
            .verifyContact(type: type, value: value, code: code);
        state = state.copyWith(stage: ContactVerificationStage.verified);
        await ref.read(currentUserControllerProvider.notifier).load();
      });

  /// Resend = a new identity confirmation (single-use reauth token).
  Future<void> resend() async {
    final value = state.value;
    if (value != null) await sendCode(value);
  }

  /// Back to editing (change the number/address).
  void edit() {
    state = state.copyWith(
      stage: ContactVerificationStage.editing,
      clearError: true,
    );
  }
}

final contactVerificationProvider = NotifierProvider.autoDispose.family<
    ContactVerificationController, ContactVerificationState, ContactType>(
  ContactVerificationController.new,
);
