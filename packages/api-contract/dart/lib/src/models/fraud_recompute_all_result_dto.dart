// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'fraud_recompute_all_result_dto.g.dart';

@JsonSerializable()
class FraudRecomputeAllResultDto {
  const FraudRecomputeAllResultDto({
    required this.accounts,
    required this.changed,
  });

  factory FraudRecomputeAllResultDto.fromJson(Map<String, Object?> json) =>
      _$FraudRecomputeAllResultDtoFromJson(json);

  final num accounts;
  final num changed;

  Map<String, Object?> toJson() => _$FraudRecomputeAllResultDtoToJson(this);
}
