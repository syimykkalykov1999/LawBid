// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_approvals_count_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminApprovalsCountEnvelope _$AdminApprovalsCountEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminApprovalsCountEnvelope(
  data: AdminApprovalsCountDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminApprovalsCountEnvelopeToJson(
  AdminApprovalsCountEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
