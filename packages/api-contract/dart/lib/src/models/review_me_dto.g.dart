// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewMeDto _$ReviewMeDtoFromJson(Map<String, dynamic> json) => ReviewMeDto(
  level: StaffReviewLevel.fromJson(json['level'] as String),
  canManage: json['canManage'] as bool,
);

Map<String, dynamic> _$ReviewMeDtoToJson(ReviewMeDto instance) =>
    <String, dynamic>{
      'level': instance.level.toJson(),
      'canManage': instance.canManage,
    };
