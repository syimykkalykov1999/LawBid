// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_purchase.dart';

part 'validate_promo_dto.g.dart';

@JsonSerializable()
class ValidatePromoDto {
  const ValidatePromoDto({required this.code, required this.appliesTo});

  factory ValidatePromoDto.fromJson(Map<String, Object?> json) =>
      _$ValidatePromoDtoFromJson(json);

  final String code;

  /// What the code is for.
  final PromoPurchase appliesTo;

  Map<String, Object?> toJson() => _$ValidatePromoDtoToJson(this);
}
