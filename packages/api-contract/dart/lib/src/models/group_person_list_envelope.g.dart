// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_person_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupPersonListEnvelope _$GroupPersonListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupPersonListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GroupPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupPersonListEnvelopeToJson(
  GroupPersonListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
