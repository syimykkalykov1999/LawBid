import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-01 — sticker packs: the picker library, packs by share
/// name, my own packs and their images.
class StickersRepository {
  StickersRepository({required Dio apiDio, required Dio storageDio})
      : _stickers = api.StickersClient(apiDio),
        _uploader = StorageUploader.dio(apiDio, storageDio);

  final api.StickersClient _stickers;
  final StorageUploader _uploader;

  /// The server's files.sticker_max_size_mb default.
  static const maxBytes = 1024 * 1024;

  Future<StickerLibrary> library() async {
    final d = (await guardApiCall(_stickers.getStickerLibrary)).data;
    return StickerLibrary(
      recent: d.recent.map(sticker).toList(),
      packs: d.packs.map(pack).toList(),
    );
  }

  Future<List<StickerPack>> featured() async =>
      (await guardApiCall(_stickers.listFeaturedStickerPacks))
          .data
          .map(pack)
          .toList();

  Future<StickerPack> get(String ref) async =>
      pack((await guardApiCall(() => _stickers.getStickerPack(ref: ref))).data);

  Future<StickerPack> create(String title) async => pack(
        (await guardApiCall(
          () => _stickers.createStickerPack(
            body: api.CreateStickerPackDto(title: title),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  Future<StickerPack> rename(String ref, String title) async => pack(
        (await guardApiCall(
          () => _stickers.renameStickerPack(
            ref: ref,
            body: api.UpdateStickerPackDto(title: title),
          ),
        ))
            .data,
      );

  Future<void> delete(String ref) =>
      guardApiCall(() => _stickers.deleteStickerPack(ref: ref));

  Future<StickerPack> install(String ref) async => pack(
        (await guardApiCall(() => _stickers.installStickerPack(ref: ref))).data,
      );

  Future<void> uninstall(String ref) =>
      guardApiCall(() => _stickers.uninstallStickerPack(ref: ref));

  Future<void> reorder(List<String> packIds) => guardApiCall(
        () => _stickers.reorderStickerPacks(
          body: api.ReorderStickerPacksDto(packIds: packIds),
        ),
      );

  Future<void> deleteSticker(String id) =>
      guardApiCall(() => _stickers.deleteSticker(id: id));

  /// Uploads [bytes] (PNG/WebP/JPEG/GIF ≤ 512 px) and adds it to my pack.
  Future<ChatSticker> add(
    String packRef,
    Uint8List bytes,
    String mime, {
    String? emoji,
  }) async {
    if (bytes.length > maxBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    // Owner 2026-10-22 (audit #4 §3): the shared uploader.
    final fileId = await _uploader.upload(
      purpose: api.FilePurpose.sticker,
      body: UploadBody.bytes(bytes),
      mime: mime,
      scanMaxPolls: 20,
    );
    return sticker(
      (await guardApiCall(
        () => _stickers.addSticker(
          ref: packRef,
          body: api.AddStickerDto(fileId: fileId, emoji: emoji ?? '🙂'),
        ),
      ))
          .data,
    );
  }

  static ChatSticker sticker(api.StickerDto d) =>
      ChatSticker(id: d.id, packId: d.packId, emoji: d.emoji, url: d.url);

  static StickerPack pack(api.StickerPackDto d) => StickerPack(
        id: d.id,
        title: d.title,
        shortName: d.shortName,
        isOfficial: d.isOfficial,
        isMine: d.isMine,
        installed: d.installed,
        installCount: d.installCount,
        stickers: d.stickers.map(sticker).toList(),
        priceStars: d.priceStars,
      );
}
