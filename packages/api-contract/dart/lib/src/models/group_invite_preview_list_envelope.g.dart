// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_invite_preview_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupInvitePreviewListEnvelope _$GroupInvitePreviewListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupInvitePreviewListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GroupInvitePreviewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupInvitePreviewListEnvelopeToJson(
  GroupInvitePreviewListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
