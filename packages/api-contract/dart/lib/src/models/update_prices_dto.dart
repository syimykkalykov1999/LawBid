// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_prices_dto.g.dart';

@JsonSerializable()
class UpdatePricesDto {
  const UpdatePricesDto({required this.values});

  factory UpdatePricesDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePricesDtoFromJson(json);

  /// Price key → new value (only known keys are saved).
  final Map<String, num> values;

  Map<String, Object?> toJson() => _$UpdatePricesDtoToJson(this);
}
