import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/trust/data/trust_repository.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';

/// Owner 2026-10-05 — attorney trust levels.
final trustRepositoryProvider = Provider<TrustRepository>(
  (ref) => TrustRepository(ref.watch(dioProvider)),
);

/// What LawBid checked about one attorney (`GET /trust/attorneys/:id`) —
/// the chip's sheet and the client's pre-payment notice.
final attorneyTrustProvider =
    FutureProvider.autoDispose.family<PublicTrust, String>(
  (ref, attorneyId) => ref.watch(trustRepositoryProvider).attorney(attorneyId),
);

/// The signed-in attorney's own level, gates and next steps
/// (`GET /trust/me`). Attorneys only — the server answers 403 otherwise.
final myTrustProvider = FutureProvider.autoDispose<OwnTrust>(
  (ref) => ref.watch(trustRepositoryProvider).me(),
);
