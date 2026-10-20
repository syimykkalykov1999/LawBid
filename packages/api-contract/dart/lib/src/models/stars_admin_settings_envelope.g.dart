// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_admin_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsAdminSettingsEnvelope _$StarsAdminSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => StarsAdminSettingsEnvelope(
  data: StarsAdminSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StarsAdminSettingsEnvelopeToJson(
  StarsAdminSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
