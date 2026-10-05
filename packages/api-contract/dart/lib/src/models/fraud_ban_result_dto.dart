// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'fraud_ban_result_dto.g.dart';

@JsonSerializable()
class FraudBanResultDto {
  const FraudBanResultDto({required this.banned});

  factory FraudBanResultDto.fromJson(Map<String, Object?> json) =>
      _$FraudBanResultDtoFromJson(json);

  /// Accounts blocked (this one and linked).
  final num banned;

  Map<String, Object?> toJson() => _$FraudBanResultDtoToJson(this);
}
