// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_cancel_promotion_dto.g.dart';

@JsonSerializable()
class AdminCancelPromotionDto {
  const AdminCancelPromotionDto({required this.reason});

  factory AdminCancelPromotionDto.fromJson(Map<String, Object?> json) =>
      _$AdminCancelPromotionDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminCancelPromotionDtoToJson(this);
}
