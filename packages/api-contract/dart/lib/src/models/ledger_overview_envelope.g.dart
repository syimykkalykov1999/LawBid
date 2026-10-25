// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ledger_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LedgerOverviewEnvelope _$LedgerOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => LedgerOverviewEnvelope(
  data: LedgerOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LedgerOverviewEnvelopeToJson(
  LedgerOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
