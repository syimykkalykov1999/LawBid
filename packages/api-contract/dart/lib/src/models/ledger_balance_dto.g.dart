// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ledger_balance_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LedgerBalanceDto _$LedgerBalanceDtoFromJson(Map<String, dynamic> json) =>
    LedgerBalanceDto(
      code: json['code'] as String,
      type: LedgerBalanceDtoType.fromJson(json['type'] as String),
      currency: json['currency'] as String,
      ownerKey: LedgerBalanceDtoOwnerKey.fromJson(json['ownerKey'] as String),
      debitCents: (json['debitCents'] as num).toInt(),
      creditCents: (json['creditCents'] as num).toInt(),
    );

Map<String, dynamic> _$LedgerBalanceDtoToJson(LedgerBalanceDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'type': instance.type.toJson(),
      'currency': instance.currency,
      'ownerKey': instance.ownerKey.toJson(),
      'debitCents': instance.debitCents,
      'creditCents': instance.creditCents,
    };
