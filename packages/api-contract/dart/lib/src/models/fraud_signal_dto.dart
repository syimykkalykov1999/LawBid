// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_signal_code.dart';

part 'fraud_signal_dto.g.dart';

@JsonSerializable()
class FraudSignalDto {
  const FraudSignalDto({
    required this.code,
    required this.count,
    required this.points,
  });

  factory FraudSignalDto.fromJson(Map<String, Object?> json) =>
      _$FraudSignalDtoFromJson(json);

  final FraudSignalCode code;
  final num count;
  final num points;

  Map<String, Object?> toJson() => _$FraudSignalDtoToJson(this);
}
