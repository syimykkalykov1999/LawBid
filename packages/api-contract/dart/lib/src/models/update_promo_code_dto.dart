// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_promo_code_dto.g.dart';

@JsonSerializable()
class UpdatePromoCodeDto {
  const UpdatePromoCodeDto({
    this.description,
    this.active,
    this.maxRedemptions,
    this.expiresAt,
  });

  factory UpdatePromoCodeDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePromoCodeDtoFromJson(json);

  final String? description;
  final bool? active;

  /// null = unlimited.
  final int? maxRedemptions;

  /// null = never expires.
  final DateTime? expiresAt;

  Map<String, Object?> toJson() => _$UpdatePromoCodeDtoToJson(this);
}
