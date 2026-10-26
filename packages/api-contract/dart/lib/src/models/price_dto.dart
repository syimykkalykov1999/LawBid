// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'price_dto.g.dart';

@JsonSerializable()
class PriceDto {
  const PriceDto({
    required this.key,
    required this.label,
    required this.unit,
    required this.value,
    required this.defaultValue,
    required this.edited,
    required this.sourceUrl,
    required this.checkedAt,
  });

  factory PriceDto.fromJson(Map<String, Object?> json) =>
      _$PriceDtoFromJson(json);

  final String key;
  final String label;
  final String unit;
  final num value;
  final num defaultValue;
  final bool edited;
  final String sourceUrl;
  final String checkedAt;

  Map<String, Object?> toJson() => _$PriceDtoToJson(this);
}
