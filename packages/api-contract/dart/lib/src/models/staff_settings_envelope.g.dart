// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSettingsEnvelope _$StaffSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffSettingsEnvelope(
  data: StaffSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffSettingsEnvelopeToJson(
  StaffSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
