// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_approval_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminApprovalEnvelope _$AdminApprovalEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminApprovalEnvelope(
  data: AdminApprovalDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminApprovalEnvelopeToJson(
  AdminApprovalEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
