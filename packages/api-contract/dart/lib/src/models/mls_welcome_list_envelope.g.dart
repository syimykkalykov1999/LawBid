// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_welcome_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsWelcomeListEnvelope _$MlsWelcomeListEnvelopeFromJson(
  Map<String, dynamic> json,
) => MlsWelcomeListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => MlsWelcomeDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MlsWelcomeListEnvelopeToJson(
  MlsWelcomeListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
