// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_gift_dto.g.dart';

@JsonSerializable()
class CreateGiftDto {
  const CreateGiftDto({
    required this.title,
    required this.priceStars,
    required this.fileId,
  });

  factory CreateGiftDto.fromJson(Map<String, Object?> json) =>
      _$CreateGiftDtoFromJson(json);

  final String title;
  final int priceStars;

  /// A clean `sticker` file uploaded by this admin.
  final String fileId;

  Map<String, Object?> toJson() => _$CreateGiftDtoToJson(this);
}
