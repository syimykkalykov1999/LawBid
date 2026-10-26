// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_invite_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupInviteListEnvelope _$GroupInviteListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupInviteListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GroupInviteDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupInviteListEnvelopeToJson(
  GroupInviteListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
