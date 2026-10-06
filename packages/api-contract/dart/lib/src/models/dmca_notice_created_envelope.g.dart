// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_notice_created_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaNoticeCreatedEnvelope _$DmcaNoticeCreatedEnvelopeFromJson(
  Map<String, dynamic> json,
) => DmcaNoticeCreatedEnvelope(
  data: DmcaNoticeCreatedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DmcaNoticeCreatedEnvelopeToJson(
  DmcaNoticeCreatedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
