// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_extend_promotion_dto.g.dart';

@JsonSerializable()
class AdminExtendPromotionDto {
  const AdminExtendPromotionDto({required this.days, required this.reason});

  factory AdminExtendPromotionDto.fromJson(Map<String, Object?> json) =>
      _$AdminExtendPromotionDtoFromJson(json);

  final int days;
  final String reason;

  Map<String, Object?> toJson() => _$AdminExtendPromotionDtoToJson(this);
}
