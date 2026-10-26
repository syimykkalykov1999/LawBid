// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'forward_response_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ForwardResponseEnvelope _$ForwardResponseEnvelopeFromJson(
  Map<String, dynamic> json,
) => ForwardResponseEnvelope(
  data: ForwardResponseDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ForwardResponseEnvelopeToJson(
  ForwardResponseEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
