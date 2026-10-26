// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contract_grant_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContractGrantListEnvelope _$ContractGrantListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ContractGrantListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ContractGrantDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContractGrantListEnvelopeToJson(
  ContractGrantListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
