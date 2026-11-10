// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_member_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMemberListEnvelope _$GroupMemberListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupMemberListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GroupMemberDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupMemberListEnvelopeToJson(
  GroupMemberListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
