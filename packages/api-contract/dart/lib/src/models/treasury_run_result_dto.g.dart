// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_run_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryRunResultDto _$TreasuryRunResultDtoFromJson(
  Map<String, dynamic> json,
) => TreasuryRunResultDto(
  skipped: json['skipped'] == null
      ? null
      : TreasuryRunResultDtoSkipped.fromJson(json['skipped'] as String),
  expensesCents: (json['expensesCents'] as num).toInt(),
  profitCents: (json['profitCents'] as num).toInt(),
  shortfallCents: (json['shortfallCents'] as num).toInt(),
);

Map<String, dynamic> _$TreasuryRunResultDtoToJson(
  TreasuryRunResultDto instance,
) => <String, dynamic>{
  'skipped': ?instance.skipped?.toJson(),
  'expensesCents': instance.expensesCents,
  'profitCents': instance.profitCents,
  'shortfallCents': instance.shortfallCents,
};
