// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reveal_pii_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RevealPiiResultEnvelope _$RevealPiiResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => RevealPiiResultEnvelope(
  data: RevealPiiResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RevealPiiResultEnvelopeToJson(
  RevealPiiResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
