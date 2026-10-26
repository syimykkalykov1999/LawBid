// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_join_request_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupJoinRequestListEnvelope _$GroupJoinRequestListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupJoinRequestListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GroupJoinRequestDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupJoinRequestListEnvelopeToJson(
  GroupJoinRequestListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
