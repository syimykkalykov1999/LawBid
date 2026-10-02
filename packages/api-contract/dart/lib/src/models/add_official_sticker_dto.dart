// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_official_sticker_dto.g.dart';

@JsonSerializable()
class AddOfficialStickerDto {
  const AddOfficialStickerDto({required this.fileId, this.emoji});

  factory AddOfficialStickerDto.fromJson(Map<String, Object?> json) =>
      _$AddOfficialStickerDtoFromJson(json);

  /// A clean `sticker` file uploaded through POST /admin/media/sticker-uploads.
  final String fileId;
  final String? emoji;

  Map<String, Object?> toJson() => _$AddOfficialStickerDtoToJson(this);
}
