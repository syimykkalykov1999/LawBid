// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'extend_contract_grant_dto.g.dart';

@JsonSerializable()
class ExtendContractGrantDto {
  const ExtendContractGrantDto({required this.months, this.reason});

  factory ExtendContractGrantDto.fromJson(Map<String, Object?> json) =>
      _$ExtendContractGrantDtoFromJson(json);

  /// Added to the end date; a grant spans at most 24 months.
  final int months;
  final String? reason;

  Map<String, Object?> toJson() => _$ExtendContractGrantDtoToJson(this);
}
