// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_shortlist_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodayShortlistDto _$StaffTodayShortlistDtoFromJson(
  Map<String, dynamic> json,
) => StaffTodayShortlistDto(
  snapshotDate: json['snapshotDate'] as String?,
  worst: (json['worst'] as List<dynamic>)
      .map((e) => StaffTodayPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  best: (json['best'] as List<dynamic>)
      .map((e) => StaffTodayPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$StaffTodayShortlistDtoToJson(
  StaffTodayShortlistDto instance,
) => <String, dynamic>{
  'snapshotDate': ?instance.snapshotDate,
  'worst': instance.worst.map((e) => e.toJson()).toList(),
  'best': instance.best.map((e) => e.toJson()).toList(),
};
