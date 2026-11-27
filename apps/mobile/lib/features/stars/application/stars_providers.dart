import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/stars/data/stars_repository.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';

final starsRepositoryProvider = Provider<StarsRepository>(
  (ref) => StarsRepository(ref.watch(dioProvider)),
);

/// The `stars` switch of the admin («Функции»): off hides every star and
/// price in the app.
final starsEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled('stars'),
);

/// The balance and the packs on offer.
final starsOverviewProvider = FutureProvider.autoDispose<StarsOverview>(
  (ref) => ref.watch(starsRepositoryProvider).overview(),
);
