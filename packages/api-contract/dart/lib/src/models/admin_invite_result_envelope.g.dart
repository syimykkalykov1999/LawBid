// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_invite_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminInviteResultEnvelope _$AdminInviteResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminInviteResultEnvelope(
  data: AdminInviteResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminInviteResultEnvelopeToJson(
  AdminInviteResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
