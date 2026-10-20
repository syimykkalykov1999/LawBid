// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_debt_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsDebtDto _$StarsDebtDtoFromJson(Map<String, dynamic> json) => StarsDebtDto(
  userId: json['userId'] as String,
  debt: (json['debt'] as num).toInt(),
  balance: (json['balance'] as num).toInt(),
);

Map<String, dynamic> _$StarsDebtDtoToJson(StarsDebtDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'debt': instance.debt,
      'balance': instance.balance,
    };
