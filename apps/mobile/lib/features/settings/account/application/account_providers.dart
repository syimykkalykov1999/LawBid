import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/onboarding/application/contact_verification_controller.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
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
    ref.watch(socialAuthNativeClientProvider),
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
    state = await AsyncValue.guard(
      () => ref.read(accountRepositoryProvider).listIdentifiers(),
    );
  }

  /// Re-reads without flashing the skeleton (after a successful link).
  Future<void> reloadQuietly() async {
    final next = await AsyncValue.guard(
      () => ref.read(accountRepositoryProvider).listIdentifiers(),
    );
    if (ref.mounted) state = next;
  }

  /// Apple/Google: native sheet → `POST /auth/identifiers`. Throws
  /// ApiException (e.g. IDENTIFIER_ALREADY_LINKED) for the screen to show.
  Future<SocialLinkOutcome> linkSocial(IdentifierProvider provider) async {
    final outcome =
        await ref.read(accountRepositoryProvider).linkSocial(provider);
    if (outcome == SocialLinkOutcome.linked) await reloadQuietly();
    return outcome;
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
/// onboarding [ContactVerificationController] (minus `confirmIdentity`),
/// so one flow screen renders both.
class IdentifierLinkController extends Notifier<ContactVerificationState> {
  IdentifierLinkController(this.type);

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

  Future<void> sendCode(String value) => _guard(() async {
        state = state.copyWith(value: value);
        await ref.read(accountRepositoryProvider).requestLinkCode(type, value);
        state = state.copyWith(
          stage: ContactVerificationStage.codeSent,
          attempt: state.attempt + 1,
        );
      });

  Future<void> verify(String code) => _guard(() async {
        final value = state.value;
        if (value == null) return;
        await ref
            .read(accountRepositoryProvider)
            .linkContact(type, value, code);
        state = state.copyWith(stage: ContactVerificationStage.verified);
        await ref.read(currentUserControllerProvider.notifier).load();
      });

  Future<void> resend() async {
    final value = state.value;
    if (value != null) await sendCode(value);
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
