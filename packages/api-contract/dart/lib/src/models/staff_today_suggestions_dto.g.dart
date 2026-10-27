// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_suggestions_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodaySuggestionsDto _$StaffTodaySuggestionsDtoFromJson(
  Map<String, dynamic> json,
) => StaffTodaySuggestionsDto(
  open: (json['open'] as num).toInt(),
  items: (json['items'] as List<dynamic>)
      .map((e) => StaffTodaySuggestionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$StaffTodaySuggestionsDtoToJson(
  StaffTodaySuggestionsDto instance,
) => <String, dynamic>{
  'open': instance.open,
  'items': instance.items.map((e) => e.toJson()).toList(),
};
