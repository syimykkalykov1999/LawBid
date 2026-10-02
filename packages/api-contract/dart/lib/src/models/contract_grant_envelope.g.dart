// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contract_grant_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContractGrantEnvelope _$ContractGrantEnvelopeFromJson(
  Map<String, dynamic> json,
) => ContractGrantEnvelope(
  data: ContractGrantDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContractGrantEnvelopeToJson(
  ContractGrantEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
