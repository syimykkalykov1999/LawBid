// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'revealed_message_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RevealedMessageEnvelope _$RevealedMessageEnvelopeFromJson(
  Map<String, dynamic> json,
) => RevealedMessageEnvelope(
  data: RevealedMessageDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RevealedMessageEnvelopeToJson(
  RevealedMessageEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
