// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/add_sticker_dto.dart';
import '../models/create_sticker_pack_dto.dart';
import '../models/reorder_sticker_packs_dto.dart';
import '../models/sticker_envelope.dart';
import '../models/sticker_library_envelope.dart';
import '../models/sticker_pack_envelope.dart';
import '../models/sticker_pack_list_envelope.dart';
import '../models/update_sticker_pack_dto.dart';

part 'stickers_client.g.dart';

@RestApi()
abstract class StickersClient {
  factory StickersClient(Dio dio, {String? baseUrl}) = _StickersClient;

  /// My sticker picker: recently used + installed packs
  @GET('/stickers')
  Future<StickerLibraryEnvelope> getStickerLibrary({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Official packs, most installed first
  @GET('/stickers/featured')
  Future<StickerPackListEnvelope> listFeaturedStickerPacks({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Order of my packs in the picker
  @PUT('/stickers/order')
  Future<void> reorderStickerPacks({
    @Body() required ReorderStickerPacksDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create my sticker pack (installed at once)
  @POST('/stickers/packs')
  Future<StickerPackEnvelope> createStickerPack({
    @Body() required CreateStickerPackDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A pack by id or short name.
  ///
  /// [ref] - Pack id or short name.
  @GET('/stickers/packs/{ref}')
  Future<StickerPackEnvelope> getStickerPack({
    @Path('ref') required String ref,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rename my pack.
  ///
  /// [ref] - Pack id or short name.
  @PATCH('/stickers/packs/{ref}')
  Future<StickerPackEnvelope> renameStickerPack({
    @Path('ref') required String ref,
    @Body() required UpdateStickerPackDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete my pack.
  ///
  /// [ref] - Pack id or short name.
  @DELETE('/stickers/packs/{ref}')
  Future<void> deleteStickerPack({
    @Path('ref') required String ref,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add my image to my pack.
  ///
  /// [ref] - Pack id or short name.
  @POST('/stickers/packs/{ref}/stickers')
  Future<StickerEnvelope> addSticker({
    @Path('ref') required String ref,
    @Body() required AddStickerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a pack to my stickers.
  ///
  /// [ref] - Pack id or short name.
  @POST('/stickers/packs/{ref}/install')
  Future<StickerPackEnvelope> installStickerPack({
    @Path('ref') required String ref,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a pack from my stickers.
  ///
  /// [ref] - Pack id or short name.
  @DELETE('/stickers/packs/{ref}/install')
  Future<void> uninstallStickerPack({
    @Path('ref') required String ref,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a sticker from my pack
  @DELETE('/stickers/{id}')
  Future<void> deleteSticker({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
