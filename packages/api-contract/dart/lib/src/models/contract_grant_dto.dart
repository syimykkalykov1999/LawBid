// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_user_dto.dart';
import 'contract_grant_status.dart';

part 'contract_grant_dto.g.dart';

@JsonSerializable()
class ContractGrantDto {
  const ContractGrantDto({
    required this.id,
    required this.userId,
    required this.user,
    required this.months,
    required this.assistantSeats,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.contractRef,
    required this.note,
    required this.createdBy,
    required this.revokedAt,
    required this.revokedBy,
    required this.revokeReason,
    required this.createdAt,
  });

  factory ContractGrantDto.fromJson(Map<String, Object?> json) =>
      _$ContractGrantDtoFromJson(json);

  final String id;
  final String userId;
  final AdminBillingUserDto? user;
  final int months;
  final int assistantSeats;
  final DateTime startsAt;
  final DateTime endsAt;
  final ContractGrantStatus status;
  final String? contractRef;
  final String? note;
  final String createdBy;
  final DateTime? revokedAt;
  final String? revokedBy;
  final String? revokeReason;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$ContractGrantDtoToJson(this);
}
