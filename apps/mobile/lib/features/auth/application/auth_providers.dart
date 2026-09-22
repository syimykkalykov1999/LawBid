import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/persistence/persistence_providers.dart';
import '../data/auth_repository.dart';
import '../data/onboarding_local_store.dart';
import '../data/stub_auth_repository.dart';

/// Swappable per the same pattern as `themeModeRepositoryProvider`
/// (docs/CHANGELOG.md stage 1.5): a real dio-backed [AuthRepository]
/// replaces this override once the full stage-1.7 auth pass lands (see
/// [AuthRepository]'s doc comment for exactly what's deferred). No screen
/// or notifier should reference [StubAuthRepository] directly — always go
/// through this provider.
final authRepositoryProvider = Provider<AuthRepository>((ref) => const StubAuthRepository());

final onboardingLocalStoreProvider = Provider<OnboardingLocalStore>(
  (ref) => OnboardingLocalStore(ref.watch(localKvStoreProvider)),
);
