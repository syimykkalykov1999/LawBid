// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'grant_stars_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GrantStarsDto _$GrantStarsDtoFromJson(Map<String, dynamic> json) =>
    GrantStarsDto(
      userId: json['userId'] as String,
      amount: (json['amount'] as num).toInt(),
      reason: json['reason'] as String,
    );

Map<String, dynamic> _$GrantStarsDtoToJson(GrantStarsDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'amount': instance.amount,
      'reason': instance.reason,
    };
