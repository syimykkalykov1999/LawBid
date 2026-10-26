// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_gift_dto_status.dart';

part 'update_gift_dto.g.dart';

@JsonSerializable()
class UpdateGiftDto {
  const UpdateGiftDto({
    this.title,
    this.priceStars,
    this.position,
    this.status,
  });

  factory UpdateGiftDto.fromJson(Map<String, Object?> json) =>
      _$UpdateGiftDtoFromJson(json);

  final String? title;
  final int? priceStars;
  final int? position;
  final UpdateGiftDtoStatus? status;

  Map<String, Object?> toJson() => _$UpdateGiftDtoToJson(this);
}
