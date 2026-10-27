// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'next_lease_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NextLeaseResultEnvelope _$NextLeaseResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => NextLeaseResultEnvelope(
  data: NextLeaseResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NextLeaseResultEnvelopeToJson(
  NextLeaseResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
