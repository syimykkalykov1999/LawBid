// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hidden_calls_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HiddenCallsEnvelope _$HiddenCallsEnvelopeFromJson(Map<String, dynamic> json) =>
    HiddenCallsEnvelope(
      data: HiddenCallsDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$HiddenCallsEnvelopeToJson(
  HiddenCallsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
