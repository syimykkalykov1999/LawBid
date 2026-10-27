// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_release_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamReleaseResultEnvelope _$TeamReleaseResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => TeamReleaseResultEnvelope(
  data: TeamReleaseResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TeamReleaseResultEnvelopeToJson(
  TeamReleaseResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
