// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_contract_grant_dto.g.dart';

@JsonSerializable()
class CreateContractGrantDto {
  const CreateContractGrantDto({
    required this.userId,
    required this.months,
    this.startsAt,
    this.contractRef,
    this.note,
    this.assistantSeats = 0,
  });

  factory CreateContractGrantDto.fromJson(Map<String, Object?> json) =>
      _$CreateContractGrantDtoFromJson(json);

  /// A live attorney.
  final String userId;
  final int months;
  final int assistantSeats;

  /// Default: now.
  final DateTime? startsAt;

  /// Contract / handle.
  final String? contractRef;
  final String? note;

  Map<String, Object?> toJson() => _$CreateContractGrantDtoToJson(this);
}
