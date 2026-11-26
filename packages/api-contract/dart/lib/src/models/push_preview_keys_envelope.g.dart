// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_preview_keys_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PushPreviewKeysEnvelope _$PushPreviewKeysEnvelopeFromJson(
  Map<String, dynamic> json,
) => PushPreviewKeysEnvelope(
  data: PushPreviewKeysDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PushPreviewKeysEnvelopeToJson(
  PushPreviewKeysEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
