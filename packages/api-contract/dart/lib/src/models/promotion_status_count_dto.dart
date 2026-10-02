// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_status_count_dto.g.dart';

@JsonSerializable()
class PromotionStatusCountDto {
  const PromotionStatusCountDto({required this.status, required this.count});

  factory PromotionStatusCountDto.fromJson(Map<String, Object?> json) =>
      _$PromotionStatusCountDtoFromJson(json);

  final String status;
  final int count;

  Map<String, Object?> toJson() => _$PromotionStatusCountDtoToJson(this);
}
