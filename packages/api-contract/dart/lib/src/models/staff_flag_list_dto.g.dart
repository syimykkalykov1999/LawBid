// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_flag_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffFlagListDto _$StaffFlagListDtoFromJson(Map<String, dynamic> json) =>
    StaffFlagListDto(
      items: (json['items'] as List<dynamic>)
          .map(
            (e) => StaffRetaliationFlagDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$StaffFlagListDtoToJson(StaffFlagListDto instance) =>
    <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
