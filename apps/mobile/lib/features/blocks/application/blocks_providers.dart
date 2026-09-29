import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/blocks/data/blocks_repository.dart';

final blocksRepositoryProvider = Provider<BlocksRepository>(
  (ref) => ApiBlocksRepository(ref.watch(dioProvider)),
);

/// Users I blocked (OQ-028); invalidated after every block / unblock.
final blockedUsersProvider = FutureProvider.autoDispose<List<BlockedUser>>(
  (ref) => ref.watch(blocksRepositoryProvider).list(),
  retry: (_, __) => null,
);

/// Ids I blocked — for menus that need the current state cheaply.
final blockedIdsProvider = FutureProvider.autoDispose<Set<String>>(
  (ref) async =>
      (await ref.watch(blockedUsersProvider.future)).map((u) => u.id).toSet(),
  retry: (_, __) => null,
);
