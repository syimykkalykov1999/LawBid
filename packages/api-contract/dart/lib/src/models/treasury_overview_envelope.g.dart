// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryOverviewEnvelope _$TreasuryOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => TreasuryOverviewEnvelope(
  data: TreasuryOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TreasuryOverviewEnvelopeToJson(
  TreasuryOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
