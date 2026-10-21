// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_join_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupJoinResultEnvelope _$GroupJoinResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupJoinResultEnvelope(
  data: GroupJoinResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupJoinResultEnvelopeToJson(
  GroupJoinResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
