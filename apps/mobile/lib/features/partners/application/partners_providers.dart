import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/partners/data/partners_repository.dart';
import 'package:lawbid/features/partners/domain/partner_models.dart';

final partnersRepositoryProvider = Provider<PartnersRepository>(
  (ref) => PartnersRepository(ref.watch(dioProvider)),
);

/// The signed-in user's partner dashboard; `isPartner` is false for
/// everyone the admin has not made a partner (Settings hides the row).
final partnerMeProvider = FutureProvider.autoDispose<PartnerMe>(
  (ref) => ref.watch(partnersRepositoryProvider).me(),
);
