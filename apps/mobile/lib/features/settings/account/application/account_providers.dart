import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/onboarding/application/contact_verification_controller.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/settings/account/data/account_repository.dart';
import 'package:lawbid/features/settings/account/domain/account_identifier.dart';

final accountApiClientProvider = Provider<AccountApiClient>(
  (ref) => AccountApiClient(ref.watch(dioProvider)),
);

/// Swappable in tests (same pattern as `onboardingRepositoryProvider`).
final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => ApiAccountRepository(
    ref.watch(accountApiClientProvider),
    ref.watch(authApiClientProvider),
  ),
);

/// Settings → Account list (docs/01 §10.3). autoDispose: re-fetched every
/// time the screen opens, so a method linked on another device shows up.
class AccountIdentifiersController
    extends AsyncNotifier<List<AccountIdentifier>> {
  @override
  Future<List<AccountIdentifier>> build() =>
      ref.read(accountRepositoryProvider).listIdentifiers();

  Future<void> refresh() async {
    state = const AsyncLoading<List<AccountIdentifier>>();
    final next = await AsyncValue.guard(
      () => ref.read(accountRepositoryProvider).listIdentifiers(),
    );
    if (ref.mounted) state = next;
  }

  /// Re-reads without flashing the skeleton (after a successful link).
  Future<void> reloadQuietly() async {
    final next = await AsyncValue.guard(
      () => ref.read(accountRepositoryProvider).listIdentifiers(),
    );
    if (ref.mounted) state = next;
  }
}

final accountIdentifiersProvider = AsyncNotifierProvider.autoDispose<
    AccountIdentifiersController, List<AccountIdentifier>>(
  AccountIdentifiersController.new,
  // No silent auto-retry: a failure shows the error/offline state with an
  // explicit Retry (file 07 screen states), not a skeleton that spins on.
  retry: (_, __) => null,
);

/// Links an ADDITIONAL phone/email sign-in method (docs/01 §10.3 "Один
/// пользователь может иметь несколько"): code via `POST /auth/otp/request`
/// → `POST /auth/identifiers`. Same state shape and stages as the
/// onboarding [ContactVerificationController], so one flow screen renders
/// both.
///
/// Owner 2026-10-22 (security audit #3): a new sign-in method is a
/// permanent way into the account, so the person first confirms it is
/// them with a code to a contact the account already has
/// (`confirmIdentity` → single-use reauth token), then the new contact.
class IdentifierLinkController extends Notifier<ContactVerificationState> {
  IdentifierLinkController(this.type);

  final ContactType type;

  /// From [confirmIdentity]; spent by [verify] (single use, 5 minutes).
  String? _reauthToken;

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

  /// Step 1: «it's me» — owner 2026-10-28: with [passwordFirst] the
  /// account password (no SMS) unless the account has none; otherwise a
  /// code to a contact the account already has.
  Future<void> sendCode(String value, {bool passwordFirst = false}) =>
      _guard(() async {
        state = state.copyWith(value: value);
        _reauthToken = null;
        final me = ref.read(currentUserControllerProvider).user;
        if (passwordFirst && !(me?.passwordRequired ?? false)) {
          state = state.copyWith(
            stage: ContactVerificationStage.confirmIdentity,
            passwordIdentity: true,
            attempt: state.attempt + 1,
          );
          return;
        }
        await _sendIdentityCode();
      });

  Future<void> _sendIdentityCode() async {
    final target =
        ref.read(currentUserControllerProvider).user?.reauthIdentifier;
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
      reauthTarget: target.identifier,
      passwordIdentity: false,
      attempt: state.attempt + 1,
    );
  }

  /// «Забыли пароль? Получить код по SMS» on the password identity step.
  Future<void> useSmsCode() => _guard(_sendIdentityCode);

  /// The account password gave the reauth token: on to the new contact.
  Future<void> confirmWithToken(String token) => _guard(() async {
        final value = state.value;
        if (value == null) return;
        _reauthToken = token;
        await _sendLinkCode(value);
      });

  /// Step 2: that code → a reauth token, then the code to the new contact.
  Future<void> confirmIdentity(String code) => _guard(() async {
        final value = state.value;
        final target = state.reauthTarget;
        if (value == null || target == null) return;
        _reauthToken = await ref
            .read(onboardingRepositoryProvider)
            .reauth(identifier: target, code: code);
        await _sendLinkCode(value);
      });

  Future<void> _sendLinkCode(String value) async {
    await ref.read(accountRepositoryProvider).requestLinkCode(type, value);
    state = state.copyWith(
      stage: ContactVerificationStage.codeSent,
      attempt: state.attempt + 1,
    );
  }

  /// Step 3: the new contact's code links it.
  Future<void> verify(String code) => _guard(() async {
        final value = state.value;
        if (value == null) return;
        await ref.read(accountRepositoryProvider).linkContact(
              type,
              value,
              code,
              reauthToken: _reauthToken,
            );
        _reauthToken = null;
        state = state.copyWith(stage: ContactVerificationStage.verified);
        await ref.read(currentUserControllerProvider.notifier).load();
      });

  /// A new code to the contact the current step is waiting on.
  Future<void> resend() async {
    final value = state.value;
    if (value == null) return;
    if (state.stage == ContactVerificationStage.codeSent &&
        _reauthToken != null) {
      await _guard(() => _sendLinkCode(value));
    } else {
      await sendCode(value, passwordFirst: state.passwordIdentity);
    }
  }

  void edit() {
    state = state.copyWith(
      stage: ContactVerificationStage.editing,
      clearError: true,
    );
  }
}

final identifierLinkProvider = NotifierProvider.autoDispose
    .family<IdentifierLinkController, ContactVerificationState, ContactType>(
  IdentifierLinkController.new,
);
