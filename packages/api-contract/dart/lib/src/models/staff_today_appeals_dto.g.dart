// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_appeals_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodayAppealsDto _$StaffTodayAppealsDtoFromJson(
  Map<String, dynamic> json,
) => StaffTodayAppealsDto(
  open: (json['open'] as num).toInt(),
  newest: (json['newest'] as List<dynamic>)
      .map((e) => StaffTodayAppealDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$StaffTodayAppealsDtoToJson(
  StaffTodayAppealsDto instance,
) => <String, dynamic>{
  'open': instance.open,
  'newest': instance.newest.map((e) => e.toJson()).toList(),
};
