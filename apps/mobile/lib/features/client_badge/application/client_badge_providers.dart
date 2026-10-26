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
