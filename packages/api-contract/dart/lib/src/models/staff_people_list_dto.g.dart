// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_people_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffPeopleListDto _$StaffPeopleListDtoFromJson(Map<String, dynamic> json) =>
    StaffPeopleListDto(
      snapshotDate: json['snapshotDate'] as String?,
      items: (json['items'] as List<dynamic>)
          .map((e) => StaffPersonDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StaffPeopleListDtoToJson(StaffPeopleListDto instance) =>
    <String, dynamic>{
      'snapshotDate': ?instance.snapshotDate,
      'items': instance.items.map((e) => e.toJson()).toList(),
    };
