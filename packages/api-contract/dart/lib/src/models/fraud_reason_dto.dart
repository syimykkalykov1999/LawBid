// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'fraud_reason_dto.g.dart';

@JsonSerializable()
class FraudReasonDto {
  const FraudReasonDto({required this.note});

  factory FraudReasonDto.fromJson(Map<String, Object?> json) =>
      _$FraudReasonDtoFromJson(json);

  final String note;

  Map<String, Object?> toJson() => _$FraudReasonDtoToJson(this);
}
