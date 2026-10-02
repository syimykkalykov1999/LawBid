import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/stickers/data/stickers_repository.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';

final stickersRepositoryProvider = Provider<StickersRepository>(
  (ref) => StickersRepository(
    apiDio: ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
  ),
);

/// Owner 2026-10-01: the sticker picker — recently used + my packs.
final stickerLibraryProvider = FutureProvider<StickerLibrary>(
  (ref) => ref.watch(stickersRepositoryProvider).library(),
);

/// Official packs to discover ("Add stickers" in the picker).
final featuredStickerPacksProvider = FutureProvider<List<StickerPack>>(
  (ref) => ref.watch(stickersRepositoryProvider).featured(),
);

/// One pack by id or share name (the pack sheet).
final stickerPackProvider = FutureProvider.family<StickerPack, String>(
  (ref, packRef) => ref.watch(stickersRepositoryProvider).get(packRef),
);
