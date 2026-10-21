// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_invite_preview_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupInvitePreviewDetailEnvelope _$GroupInvitePreviewDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupInvitePreviewDetailEnvelope(
  data: GroupInvitePreviewDetailDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupInvitePreviewDetailEnvelopeToJson(
  GroupInvitePreviewDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
