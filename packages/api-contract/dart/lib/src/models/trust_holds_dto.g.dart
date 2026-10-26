// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_holds_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustHoldsDto _$TrustHoldsDtoFromJson(Map<String, dynamic> json) =>
    TrustHoldsDto(
      payments: json['payments'] as String?,
      paymentsAt: json['paymentsAt'] == null
          ? null
          : DateTime.parse(json['paymentsAt'] as String),
      bids: json['bids'] as String?,
      bidsAt: json['bidsAt'] == null
          ? null
          : DateTime.parse(json['bidsAt'] as String),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$TrustHoldsDtoToJson(TrustHoldsDto instance) =>
    <String, dynamic>{
      'payments': ?instance.payments,
      'paymentsAt': ?instance.paymentsAt?.toIso8601String(),
      'bids': ?instance.bids,
      'bidsAt': ?instance.bidsAt?.toIso8601String(),
      'note': ?instance.note,
    };
