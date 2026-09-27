import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/settings/active_devices/data/active_devices_repository_impl.dart';
import 'package:lawbid/features/settings/active_devices/domain/active_devices_repository.dart';

/// Composition root of the active-devices feature: the only file that
/// binds the domain [ActiveDevicesRepository] to its data implementation,
/// so the controller and screen import domain types only (docs/01 §6.4).
/// Override in tests with a fake repository.
final activeDevicesRepositoryProvider = Provider<ActiveDevicesRepository>(
  (ref) => ActiveDevicesRepositoryImpl(
    ActiveDevicesApiClient(ref.watch(dioProvider)),
    ref.watch(authRepositoryProvider),
  ),
);
