// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_update_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseUpdateListEnvelope _$CaseUpdateListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseUpdateListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CaseUpdateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseUpdateListEnvelopeToJson(
  CaseUpdateListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
