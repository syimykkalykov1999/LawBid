// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_sticker_pack_dto.g.dart';

@JsonSerializable()
class UpdateStickerPackDto {
  const UpdateStickerPackDto({required this.title});

  factory UpdateStickerPackDto.fromJson(Map<String, Object?> json) =>
      _$UpdateStickerPackDtoFromJson(json);

  final String title;

  Map<String, Object?> toJson() => _$UpdateStickerPackDtoToJson(this);
}
