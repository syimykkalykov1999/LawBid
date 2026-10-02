// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_official_sticker_pack_dto.g.dart';

@JsonSerializable()
class CreateOfficialStickerPackDto {
  const CreateOfficialStickerPackDto({required this.title, this.shortName});

  factory CreateOfficialStickerPackDto.fromJson(Map<String, Object?> json) =>
      _$CreateOfficialStickerPackDtoFromJson(json);

  final String title;

  /// Share name (lawbid.app/stickers/<shortName>); generated if omitted.
  final String? shortName;

  Map<String, Object?> toJson() => _$CreateOfficialStickerPackDtoToJson(this);
}
