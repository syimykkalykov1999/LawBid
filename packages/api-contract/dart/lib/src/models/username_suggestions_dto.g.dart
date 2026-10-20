// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'username_suggestions_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsernameSuggestionsDto _$UsernameSuggestionsDtoFromJson(
  Map<String, dynamic> json,
) => UsernameSuggestionsDto(
  suggestions: (json['suggestions'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$UsernameSuggestionsDtoToJson(
  UsernameSuggestionsDto instance,
) => <String, dynamic>{'suggestions': instance.suggestions};
