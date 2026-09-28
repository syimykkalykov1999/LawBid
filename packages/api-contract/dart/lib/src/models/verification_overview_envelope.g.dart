// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationOverviewEnvelope _$VerificationOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => VerificationOverviewEnvelope(
  data: VerificationOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$VerificationOverviewEnvelopeToJson(
  VerificationOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
