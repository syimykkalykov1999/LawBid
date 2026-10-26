import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/stars/data/stars_repository.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';

final starsRepositoryProvider = Provider<StarsRepository>(
  (ref) => StarsRepository(ref.watch(dioProvider)),
);

/// The `stars` switch of the admin («Функции»): off hides every star,
/// gift and price in the app.
final starsEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled('stars'),
);

/// The balance and the packs on offer.
final starsOverviewProvider = FutureProvider.autoDispose<StarsOverview>(
  (ref) => ref.watch(starsRepositoryProvider).overview(),
);

/// The gifts the admin put in the catalog.
final giftCatalogProvider = FutureProvider.autoDispose<List<Gift>>(
  (ref) => ref.watch(starsRepositoryProvider).gifts(),
);

/// A profile's gift showcase (the owner sees all of their gifts).
final giftShowcaseProvider =
    FutureProvider.autoDispose.family<List<GiftSend>, String>(
  (ref, userId) async =>
      (await ref.watch(starsRepositoryProvider).showcase(userId)).items,
);
