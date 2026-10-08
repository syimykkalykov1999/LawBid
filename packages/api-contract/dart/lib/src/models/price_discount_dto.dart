// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'price_discount_dto.g.dart';

@JsonSerializable()
class PriceDiscountDto {
  const PriceDiscountDto({required this.compareAtCents, required this.percent});

  factory PriceDiscountDto.fromJson(Map<String, Object?> json) =>
      _$PriceDiscountDtoFromJson(json);

  /// Old price, struck through.
  final int compareAtCents;
  final int percent;

  Map<String, Object?> toJson() => _$PriceDiscountDtoToJson(this);
}
