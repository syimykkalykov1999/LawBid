// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'settings_revert_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SettingsRevertResultEnvelope _$SettingsRevertResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => SettingsRevertResultEnvelope(
  data: SettingsRevertResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SettingsRevertResultEnvelopeToJson(
  SettingsRevertResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
