// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ledger_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LedgerOverviewDto _$LedgerOverviewDtoFromJson(Map<String, dynamic> json) =>
    LedgerOverviewDto(
      balances: (json['balances'] as List<dynamic>)
          .map((e) => LedgerBalanceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      last: json['last'] == null
          ? null
          : LedgerReconcileDto.fromJson(json['last'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LedgerOverviewDtoToJson(LedgerOverviewDto instance) =>
    <String, dynamic>{
      'balances': instance.balances.map((e) => e.toJson()).toList(),
      'last': ?instance.last?.toJson(),
    };
