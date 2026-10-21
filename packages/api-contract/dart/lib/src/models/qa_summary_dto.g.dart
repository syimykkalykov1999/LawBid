// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qa_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QaSummaryDto _$QaSummaryDtoFromJson(Map<String, dynamic> json) => QaSummaryDto(
  newCount: json['newCount'] as num,
  bannerEnabled: json['bannerEnabled'] as bool,
  bannerIntervalHours: json['bannerIntervalHours'] as num,
  bannerMinNew: json['bannerMinNew'] as num,
  profileCtaEnabled: json['profileCtaEnabled'] as bool,
);

Map<String, dynamic> _$QaSummaryDtoToJson(QaSummaryDto instance) =>
    <String, dynamic>{
      'newCount': instance.newCount,
      'bannerEnabled': instance.bannerEnabled,
      'bannerIntervalHours': instance.bannerIntervalHours,
      'bannerMinNew': instance.bannerMinNew,
      'profileCtaEnabled': instance.profileCtaEnabled,
    };
