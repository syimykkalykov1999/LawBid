// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_team_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewTeamDto _$ReviewTeamDtoFromJson(Map<String, dynamic> json) =>
    ReviewTeamDto(
      snapshotDate: json['snapshotDate'] as String?,
      items: (json['items'] as List<dynamic>)
          .map((e) => ReviewTeamRowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ReviewTeamDtoToJson(ReviewTeamDto instance) =>
    <String, dynamic>{
      'snapshotDate': ?instance.snapshotDate,
      'items': instance.items.map((e) => e.toJson()).toList(),
    };
