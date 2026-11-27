// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_mls_welcome_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMlsWelcomeListEnvelope _$GroupMlsWelcomeListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupMlsWelcomeListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GroupMlsWelcomeDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupMlsWelcomeListEnvelopeToJson(
  GroupMlsWelcomeListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
