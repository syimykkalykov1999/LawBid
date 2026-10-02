import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/promotions/data/promotions_repository.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';

final promotionsRepositoryProvider = Provider<PromotionsRepository>(
  (ref) => PromotionsRepository(ref.watch(dioProvider)),
);

/// The promotion state of one case (the owner's case screen).
final casePromotionProvider =
    FutureProvider.autoDispose.family<CasePromotionState, String>(
  (ref, caseId) => ref.watch(promotionsRepositoryProvider).state(caseId),
);
