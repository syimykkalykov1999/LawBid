// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_activity_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseActivityListEnvelope _$CaseActivityListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseActivityListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CaseActivityDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseActivityListEnvelopeToJson(
  CaseActivityListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
