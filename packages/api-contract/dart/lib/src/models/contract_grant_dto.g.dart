// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contract_grant_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContractGrantDto _$ContractGrantDtoFromJson(Map<String, dynamic> json) =>
    ContractGrantDto(
      id: json['id'] as String,
      userId: json['userId'] as String,
      user: json['user'] == null
          ? null
          : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
      months: (json['months'] as num).toInt(),
      assistantSeats: (json['assistantSeats'] as num).toInt(),
      startsAt: DateTime.parse(json['startsAt'] as String),
      endsAt: DateTime.parse(json['endsAt'] as String),
      status: ContractGrantStatus.fromJson(json['status'] as String),
      contractRef: json['contractRef'] as String?,
      note: json['note'] as String?,
      createdBy: json['createdBy'] as String,
      revokedAt: json['revokedAt'] == null
          ? null
          : DateTime.parse(json['revokedAt'] as String),
      revokedBy: json['revokedBy'] as String?,
      revokeReason: json['revokeReason'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$ContractGrantDtoToJson(ContractGrantDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'user': ?instance.user?.toJson(),
      'months': instance.months,
      'assistantSeats': instance.assistantSeats,
      'startsAt': instance.startsAt.toIso8601String(),
      'endsAt': instance.endsAt.toIso8601String(),
      'status': instance.status.toJson(),
      'contractRef': ?instance.contractRef,
      'note': ?instance.note,
      'createdBy': instance.createdBy,
      'revokedAt': ?instance.revokedAt?.toIso8601String(),
      'revokedBy': ?instance.revokedBy,
      'revokeReason': ?instance.revokeReason,
      'createdAt': instance.createdAt.toIso8601String(),
    };
