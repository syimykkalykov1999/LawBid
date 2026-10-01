// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_practice_area_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPracticeAreaListEnvelope _$AdminPracticeAreaListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPracticeAreaListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminPracticeAreaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPracticeAreaListEnvelopeToJson(
  AdminPracticeAreaListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
