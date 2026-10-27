// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_shortlist_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffShortlistDto _$StaffShortlistDtoFromJson(Map<String, dynamic> json) =>
    StaffShortlistDto(
      snapshotDate: json['snapshotDate'] as String?,
      worst: (json['worst'] as List<dynamic>)
          .map((e) => StaffPersonDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      best: (json['best'] as List<dynamic>)
          .map((e) => StaffPersonDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StaffShortlistDtoToJson(StaffShortlistDto instance) =>
    <String, dynamic>{
      'snapshotDate': ?instance.snapshotDate,
      'worst': instance.worst.map((e) => e.toJson()).toList(),
      'best': instance.best.map((e) => e.toJson()).toList(),
    };
