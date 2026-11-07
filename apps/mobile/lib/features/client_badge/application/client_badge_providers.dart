import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/client_badge/data/client_badge_repository.dart';
import 'package:lawbid/features/client_badge/domain/client_badge_models.dart';

final clientBadgeRepositoryProvider = Provider<ClientBadgeRepository>(
  (ref) => ClientBadgeRepository(ref.watch(dioProvider)),
);

final clientBadgeProvider = FutureProvider.autoDispose<ClientBadgeState>(
  (ref) => ref.watch(clientBadgeRepositoryProvider).me(),
);

/// Owner 2026-11-04 (R-398): whether this client wears the gold badge now —
/// what «Рилсы: публикация клиентами → Только с галочкой» looks at. Kept
/// for the session (not autoDispose): one request, asked only while that
/// mode is on and only by a client; the badge screen invalidates it when
/// the state changes. Unknown (loading, offline) counts as «no badge».
final clientBadgeActiveProvider = FutureProvider<bool>(
  (ref) async =>
      (await ref.watch(clientBadgeRepositoryProvider).me()).badgeActive,
);
