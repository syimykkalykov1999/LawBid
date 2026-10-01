// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'activity_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ActivityListEnvelope _$ActivityListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ActivityListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ActivityDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ActivityListEnvelopeToJson(
  ActivityListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
