// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_invite_accept_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminInviteAcceptResultEnvelope _$AdminInviteAcceptResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminInviteAcceptResultEnvelope(
  data: AdminInviteAcceptResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminInviteAcceptResultEnvelopeToJson(
  AdminInviteAcceptResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
