// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupEnvelope _$GroupEnvelopeFromJson(Map<String, dynamic> json) =>
    GroupEnvelope(
      data: GroupDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$GroupEnvelopeToJson(GroupEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
