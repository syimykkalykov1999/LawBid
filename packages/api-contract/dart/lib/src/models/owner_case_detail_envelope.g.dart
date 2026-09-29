// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'owner_case_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnerCaseDetailEnvelope _$OwnerCaseDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => OwnerCaseDetailEnvelope(
  data: OwnerCaseDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OwnerCaseDetailEnvelopeToJson(
  OwnerCaseDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
