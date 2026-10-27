// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodayPersonDto _$StaffTodayPersonDtoFromJson(Map<String, dynamic> json) =>
    StaffTodayPersonDto(
      adminId: json['adminId'] as String,
      name: json['name'] as String,
      workspace: StaffTodayPersonDtoWorkspace.fromJson(
        json['workspace'] as String,
      ),
      rating: json['rating'] as num?,
      status: json['status'] as String,
      flags: (json['flags'] as List<dynamic>).map((e) => e as String).toList(),
      decisions: (json['decisions'] as num).toInt(),
    );

Map<String, dynamic> _$StaffTodayPersonDtoToJson(
  StaffTodayPersonDto instance,
) => <String, dynamic>{
  'adminId': instance.adminId,
  'name': instance.name,
  'workspace': instance.workspace.toJson(),
  'rating': ?instance.rating,
  'status': instance.status,
  'flags': instance.flags,
  'decisions': instance.decisions,
};
