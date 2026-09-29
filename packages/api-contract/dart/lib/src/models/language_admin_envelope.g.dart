// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'language_admin_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LanguageAdminEnvelope _$LanguageAdminEnvelopeFromJson(
  Map<String, dynamic> json,
) => LanguageAdminEnvelope(
  data: LanguageAdminDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LanguageAdminEnvelopeToJson(
  LanguageAdminEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
