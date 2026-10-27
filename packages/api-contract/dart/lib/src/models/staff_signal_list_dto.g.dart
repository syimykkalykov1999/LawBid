// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_signal_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSignalListDto _$StaffSignalListDtoFromJson(Map<String, dynamic> json) =>
    StaffSignalListDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => StaffSignalDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StaffSignalListDtoToJson(StaffSignalListDto instance) =>
    <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
