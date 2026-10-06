// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_setup_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasurySetupDto _$TreasurySetupDtoFromJson(Map<String, dynamic> json) =>
    TreasurySetupDto(
      stripeConnected: json['stripeConnected'] as bool,
      manualPayouts: json['manualPayouts'] as bool,
      payoutInterval: json['payoutInterval'] as String?,
      banksListed: json['banksListed'] as bool,
      bankCount: (json['bankCount'] as num).toInt(),
      separateExpenseBank: json['separateExpenseBank'] as bool,
    );

Map<String, dynamic> _$TreasurySetupDtoToJson(TreasurySetupDto instance) =>
    <String, dynamic>{
      'stripeConnected': instance.stripeConnected,
      'manualPayouts': instance.manualPayouts,
      'payoutInterval': ?instance.payoutInterval,
      'banksListed': instance.banksListed,
      'bankCount': instance.bankCount,
      'separateExpenseBank': instance.separateExpenseBank,
    };
