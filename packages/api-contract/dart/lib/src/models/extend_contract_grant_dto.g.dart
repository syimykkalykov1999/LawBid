// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'extend_contract_grant_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExtendContractGrantDto _$ExtendContractGrantDtoFromJson(
  Map<String, dynamic> json,
) => ExtendContractGrantDto(
  months: (json['months'] as num).toInt(),
  reason: json['reason'] as String?,
);

Map<String, dynamic> _$ExtendContractGrantDtoToJson(
  ExtendContractGrantDto instance,
) => <String, dynamic>{'months': instance.months, 'reason': ?instance.reason};
