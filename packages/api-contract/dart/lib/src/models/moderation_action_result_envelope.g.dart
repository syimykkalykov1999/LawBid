// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_action_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationActionResultEnvelope _$ModerationActionResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => ModerationActionResultEnvelope(
  data: ModerationActionResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ModerationActionResultEnvelopeToJson(
  ModerationActionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
