// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'media_check_page_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MediaCheckPageEnvelope _$MediaCheckPageEnvelopeFromJson(
  Map<String, dynamic> json,
) => MediaCheckPageEnvelope(
  data: MediaCheckPageDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MediaCheckPageEnvelopeToJson(
  MediaCheckPageEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
