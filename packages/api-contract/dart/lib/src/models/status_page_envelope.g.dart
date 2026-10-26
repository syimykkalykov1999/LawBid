// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'status_page_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StatusPageEnvelope _$StatusPageEnvelopeFromJson(Map<String, dynamic> json) =>
    StatusPageEnvelope(
      data: StatusPageDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StatusPageEnvelopeToJson(StatusPageEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
