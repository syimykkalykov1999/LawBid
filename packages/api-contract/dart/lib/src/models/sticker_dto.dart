// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sticker_dto.g.dart';

@JsonSerializable()
class StickerDto {
  const StickerDto({
    required this.id,
    required this.packId,
    required this.emoji,
    required this.url,
  });

  factory StickerDto.fromJson(Map<String, Object?> json) =>
      _$StickerDtoFromJson(json);

  final String id;
  final String packId;

  /// The emoji this sticker stands for.
  final String emoji;

  /// Null while the image is being checked.
  final String? url;

  Map<String, Object?> toJson() => _$StickerDtoToJson(this);
}
