// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_notice_brief_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaNoticeBriefEnvelope _$DmcaNoticeBriefEnvelopeFromJson(
  Map<String, dynamic> json,
) => DmcaNoticeBriefEnvelope(
  data: DmcaNoticeBriefDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DmcaNoticeBriefEnvelopeToJson(
  DmcaNoticeBriefEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
