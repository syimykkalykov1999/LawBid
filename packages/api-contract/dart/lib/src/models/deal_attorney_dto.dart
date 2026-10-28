// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'deal_attorney_dto.g.dart';

@JsonSerializable()
class DealAttorneyDto {
  const DealAttorneyDto({
    required this.fullName,
    required this.email,
    required this.username,
    required this.barState,
    required this.barNumber,
    required this.firmName,
  });

  factory DealAttorneyDto.fromJson(Map<String, Object?> json) =>
      _$DealAttorneyDtoFromJson(json);

  final String fullName;
  final String? email;
  final String? username;
  final String? barState;
  final String? barNumber;
  final String? firmName;

  Map<String, Object?> toJson() => _$DealAttorneyDtoToJson(this);
}
