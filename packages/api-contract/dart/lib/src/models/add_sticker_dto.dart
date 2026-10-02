// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_sticker_dto.g.dart';

@JsonSerializable()
class AddStickerDto {
  const AddStickerDto({required this.fileId, this.emoji = '🙂'});

  factory AddStickerDto.fromJson(Map<String, Object?> json) =>
      _$AddStickerDtoFromJson(json);

  /// A clean `sticker` file of the caller.
  final String fileId;
  final String emoji;

  Map<String, Object?> toJson() => _$AddStickerDtoToJson(this);
}
