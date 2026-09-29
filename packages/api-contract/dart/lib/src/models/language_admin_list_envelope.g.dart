// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'language_admin_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LanguageAdminListEnvelope _$LanguageAdminListEnvelopeFromJson(
  Map<String, dynamic> json,
) => LanguageAdminListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => LanguageAdminDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LanguageAdminListEnvelopeToJson(
  LanguageAdminListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
