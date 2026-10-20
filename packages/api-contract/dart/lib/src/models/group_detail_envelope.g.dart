// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupDetailEnvelope _$GroupDetailEnvelopeFromJson(Map<String, dynamic> json) =>
    GroupDetailEnvelope(
      data: GroupDetailDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$GroupDetailEnvelopeToJson(
  GroupDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
