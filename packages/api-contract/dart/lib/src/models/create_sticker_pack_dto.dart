// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_sticker_pack_dto.g.dart';

@JsonSerializable()
class CreateStickerPackDto {
  const CreateStickerPackDto({required this.title});

  factory CreateStickerPackDto.fromJson(Map<String, Object?> json) =>
      _$CreateStickerPackDtoFromJson(json);

  final String title;

  Map<String, Object?> toJson() => _$CreateStickerPackDtoToJson(this);
}
