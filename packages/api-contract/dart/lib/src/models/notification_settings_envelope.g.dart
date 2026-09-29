// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NotificationSettingsEnvelope _$NotificationSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => NotificationSettingsEnvelope(
  data: NotificationSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NotificationSettingsEnvelopeToJson(
  NotificationSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
