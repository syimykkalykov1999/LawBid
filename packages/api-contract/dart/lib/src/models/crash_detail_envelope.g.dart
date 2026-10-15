// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crash_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrashDetailEnvelope _$CrashDetailEnvelopeFromJson(Map<String, dynamic> json) =>
    CrashDetailEnvelope(
      data: CrashDetailDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CrashDetailEnvelopeToJson(
  CrashDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
