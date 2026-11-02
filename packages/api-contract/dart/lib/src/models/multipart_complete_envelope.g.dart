// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'multipart_complete_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MultipartCompleteEnvelope _$MultipartCompleteEnvelopeFromJson(
  Map<String, dynamic> json,
) => MultipartCompleteEnvelope(
  data: MultipartCompleteDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MultipartCompleteEnvelopeToJson(
  MultipartCompleteEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
