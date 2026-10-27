// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_suggestion_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSuggestionListDto _$StaffSuggestionListDtoFromJson(
  Map<String, dynamic> json,
) => StaffSuggestionListDto(
  items: (json['items'] as List<dynamic>)
      .map((e) => StaffSuggestionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$StaffSuggestionListDtoToJson(
  StaffSuggestionListDto instance,
) => <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
