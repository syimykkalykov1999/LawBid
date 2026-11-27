// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_mls_lease_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMlsLeaseResultEnvelope _$GroupMlsLeaseResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupMlsLeaseResultEnvelope(
  data: GroupMlsLeaseResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupMlsLeaseResultEnvelopeToJson(
  GroupMlsLeaseResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
