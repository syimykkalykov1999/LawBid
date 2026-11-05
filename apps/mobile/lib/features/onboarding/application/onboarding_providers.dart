import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/onboarding/data/onboarding_repository.dart';
import 'package:lawbid/features/onboarding/data/role_switch_repository.dart';
import 'package:lawbid/features/onboarding/data/users_api_client.dart';

final usersApiClientProvider = Provider<UsersApiClient>(
  (ref) => UsersApiClient(ref.watch(dioProvider)),
);

/// Owner 2026-11-05: Settings → Account «Сменить профиль».
final roleSwitchRepositoryProvider = Provider<RoleSwitchRepository>(
  (ref) => ApiRoleSwitchRepository(ref.watch(usersApiClientProvider)),
);

/// Swappable in tests (same pattern as `authRepositoryProvider`).
final onboardingRepositoryProvider = Provider<OnboardingRepository>(
  (ref) => ApiOnboardingRepository(
    ref.watch(usersApiClientProvider),
    ref.watch(authApiClientProvider),
  ),
);
