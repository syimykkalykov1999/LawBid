// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_bank_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryBankDto _$TreasuryBankDtoFromJson(Map<String, dynamic> json) =>
    TreasuryBankDto(
      id: json['id'] as String,
      label: json['label'] as String,
      last4: json['last4'] as String,
      isDefault: json['isDefault'] as bool,
    );

Map<String, dynamic> _$TreasuryBankDtoToJson(TreasuryBankDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'label': instance.label,
      'last4': instance.last4,
      'isDefault': instance.isDefault,
    };
