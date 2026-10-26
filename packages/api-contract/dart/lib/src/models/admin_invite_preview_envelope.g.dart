// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_invite_preview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminInvitePreviewEnvelope _$AdminInvitePreviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminInvitePreviewEnvelope(
  data: AdminInvitePreviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminInvitePreviewEnvelopeToJson(
  AdminInvitePreviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
