// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_payout_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryPayoutDto _$TreasuryPayoutDtoFromJson(Map<String, dynamic> json) =>
    TreasuryPayoutDto(
      id: json['id'] as String,
      period: json['period'] as String,
      kind: TreasuryPayoutDtoKind.fromJson(json['kind'] as String),
      trigger: TreasuryPayoutDtoTrigger.fromJson(json['trigger'] as String),
      amountCents: (json['amountCents'] as num).toInt(),
      destinationLabel: json['destinationLabel'] as String?,
      status: TreasuryPayoutDtoStatus.fromJson(json['status'] as String),
      failure: json['failure'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$TreasuryPayoutDtoToJson(TreasuryPayoutDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'period': instance.period,
      'kind': instance.kind.toJson(),
      'trigger': instance.trigger.toJson(),
      'amountCents': instance.amountCents,
      'destinationLabel': ?instance.destinationLabel,
      'status': instance.status.toJson(),
      'failure': ?instance.failure,
      'createdAt': instance.createdAt.toIso8601String(),
    };
