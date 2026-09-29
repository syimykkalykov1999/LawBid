// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_card_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationCardEnvelope _$ModerationCardEnvelopeFromJson(
  Map<String, dynamic> json,
) => ModerationCardEnvelope(
  data: ModerationCardDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ModerationCardEnvelopeToJson(
  ModerationCardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
