// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_invite_preview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupInvitePreviewEnvelope _$GroupInvitePreviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupInvitePreviewEnvelope(
  data: GroupInvitePreviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupInvitePreviewEnvelopeToJson(
  GroupInvitePreviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
