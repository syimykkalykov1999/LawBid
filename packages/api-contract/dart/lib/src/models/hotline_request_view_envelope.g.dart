// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_request_view_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineRequestViewEnvelope _$HotlineRequestViewEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineRequestViewEnvelope(
  data: HotlineRequestViewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineRequestViewEnvelopeToJson(
  HotlineRequestViewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
