// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_message_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportMessageEnvelope _$SupportMessageEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportMessageEnvelope(
  data: SupportMessageDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportMessageEnvelopeToJson(
  SupportMessageEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
