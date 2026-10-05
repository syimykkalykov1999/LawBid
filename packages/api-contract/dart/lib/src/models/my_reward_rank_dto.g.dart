// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_reward_rank_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyRewardRankDto _$MyRewardRankDtoFromJson(Map<String, dynamic> json) =>
    MyRewardRankDto(
      department: MyRewardRankDtoDepartment.fromJson(
        json['department'] as String,
      ),
      label: json['label'] as String,
      score: json['score'] as num,
      of: json['of'] as num,
      prize: json['prize'] as String,
      rank: json['rank'] as num?,
      leaderName: json['leaderName'] as String?,
    );

Map<String, dynamic> _$MyRewardRankDtoToJson(MyRewardRankDto instance) =>
    <String, dynamic>{
      'department': instance.department.toJson(),
      'label': instance.label,
      'rank': ?instance.rank,
      'score': instance.score,
      'of': instance.of,
      'prize': instance.prize,
      'leaderName': ?instance.leaderName,
    };
