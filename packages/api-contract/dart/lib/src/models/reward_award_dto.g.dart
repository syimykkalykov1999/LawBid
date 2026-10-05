// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_award_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardAwardDto _$RewardAwardDtoFromJson(Map<String, dynamic> json) =>
    RewardAwardDto(
      id: json['id'] as String,
      period: json['period'] as String,
      department: RewardAwardDtoDepartment.fromJson(
        json['department'] as String,
      ),
      adminId: json['adminId'] as String,
      name: json['name'] as String,
      rank: json['rank'] as num,
      score: json['score'] as num,
      prize: json['prize'] as String,
      bonusCents: json['bonusCents'] as num,
      currency: json['currency'] as String,
      onPayroll: json['onPayroll'] as bool,
      auto: json['auto'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$RewardAwardDtoToJson(RewardAwardDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'period': instance.period,
      'department': instance.department.toJson(),
      'adminId': instance.adminId,
      'name': instance.name,
      'rank': instance.rank,
      'score': instance.score,
      'prize': instance.prize,
      'bonusCents': instance.bonusCents,
      'currency': instance.currency,
      'onPayroll': instance.onPayroll,
      'auto': instance.auto,
      'createdAt': instance.createdAt.toIso8601String(),
    };
