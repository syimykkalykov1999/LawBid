// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'address_suggestions_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddressSuggestionsDto _$AddressSuggestionsDtoFromJson(
  Map<String, dynamic> json,
) => AddressSuggestionsDto(
  enabled: json['enabled'] as bool,
  items: (json['items'] as List<dynamic>)
      .map((e) => AddressSuggestionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AddressSuggestionsDtoToJson(
  AddressSuggestionsDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'items': instance.items.map((e) => e.toJson()).toList(),
};
