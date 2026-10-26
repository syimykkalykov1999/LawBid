// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contract_grant_info_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContractGrantInfoDto _$ContractGrantInfoDtoFromJson(
  Map<String, dynamic> json,
) => ContractGrantInfoDto(
  endsAt: DateTime.parse(json['endsAt'] as String),
  assistantSeats: (json['assistantSeats'] as num).toInt(),
);

Map<String, dynamic> _$ContractGrantInfoDtoToJson(
  ContractGrantInfoDto instance,
) => <String, dynamic>{
  'endsAt': instance.endsAt.toIso8601String(),
  'assistantSeats': instance.assistantSeats,
};
