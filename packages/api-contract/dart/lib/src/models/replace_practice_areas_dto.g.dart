// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'replace_practice_areas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReplacePracticeAreasDto _$ReplacePracticeAreasDtoFromJson(
  Map<String, dynamic> json,
) => ReplacePracticeAreasDto(
  practiceAreaIds: (json['practiceAreaIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ReplacePracticeAreasDtoToJson(
  ReplacePracticeAreasDto instance,
) => <String, dynamic>{'practiceAreaIds': instance.practiceAreaIds};
