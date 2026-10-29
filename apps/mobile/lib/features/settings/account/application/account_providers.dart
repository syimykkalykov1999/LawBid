import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/settings/account/data/account_repository.dart';
import 'package:lawbid/features/settings/account/domain/account_identifier.dart';

final accountApiClientProvider = Provider<AccountApiClient>(
  (ref) => AccountApiClient(ref.watch(dioProvider)),
);

/// Swappable in tests (same pattern as `onboardingRepositoryProvider`).
final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => ApiAccountRepository(ref.watch(accountApiClientProvider)),
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
