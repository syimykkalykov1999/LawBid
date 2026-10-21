// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_brief_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserBriefListEnvelope _$UserBriefListEnvelopeFromJson(
  Map<String, dynamic> json,
) => UserBriefListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => UserBriefDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$UserBriefListEnvelopeToJson(
  UserBriefListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
