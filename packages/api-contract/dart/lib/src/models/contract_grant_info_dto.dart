// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'contract_grant_info_dto.g.dart';

@JsonSerializable()
class ContractGrantInfoDto {
  const ContractGrantInfoDto({
    required this.endsAt,
    required this.assistantSeats,
  });

  factory ContractGrantInfoDto.fromJson(Map<String, Object?> json) =>
      _$ContractGrantInfoDtoFromJson(json);

  final DateTime endsAt;
  final int assistantSeats;

  Map<String, Object?> toJson() => _$ContractGrantInfoDtoToJson(this);
}
