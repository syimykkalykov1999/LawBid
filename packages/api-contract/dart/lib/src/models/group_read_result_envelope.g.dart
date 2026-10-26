// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_read_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupReadResultEnvelope _$GroupReadResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupReadResultEnvelope(
  data: GroupReadResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupReadResultEnvelopeToJson(
  GroupReadResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
