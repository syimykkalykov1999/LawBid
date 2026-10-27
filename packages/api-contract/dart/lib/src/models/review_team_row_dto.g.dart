// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_team_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewTeamRowDto _$ReviewTeamRowDtoFromJson(Map<String, dynamic> json) =>
    ReviewTeamRowDto(
      adminId: json['adminId'] as String,
      name: json['name'] as String,
      decisions: json['decisions'] as num,
      returnedRate: json['returnedRate'] as num?,
      sampled: json['sampled'] as num,
      overturned: json['overturned'] as num,
      goldenTotal: json['goldenTotal'] as num,
      goldenFailed: json['goldenFailed'] as num,
    );

Map<String, dynamic> _$ReviewTeamRowDtoToJson(ReviewTeamRowDto instance) =>
    <String, dynamic>{
      'adminId': instance.adminId,
      'name': instance.name,
      'decisions': instance.decisions,
      'returnedRate': ?instance.returnedRate,
      'sampled': instance.sampled,
      'overturned': instance.overturned,
      'goldenTotal': instance.goldenTotal,
      'goldenFailed': instance.goldenFailed,
    };
