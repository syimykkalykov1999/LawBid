// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_contract_grant_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateContractGrantDto _$CreateContractGrantDtoFromJson(
  Map<String, dynamic> json,
) => CreateContractGrantDto(
  userId: json['userId'] as String,
  months: (json['months'] as num).toInt(),
  startsAt: json['startsAt'] == null
      ? null
      : DateTime.parse(json['startsAt'] as String),
  contractRef: json['contractRef'] as String?,
  note: json['note'] as String?,
  assistantSeats: (json['assistantSeats'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$CreateContractGrantDtoToJson(
  CreateContractGrantDto instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'months': instance.months,
  'assistantSeats': instance.assistantSeats,
  'startsAt': ?instance.startsAt?.toIso8601String(),
  'contractRef': ?instance.contractRef,
  'note': ?instance.note,
};
