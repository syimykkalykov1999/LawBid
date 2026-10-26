// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_learned_link_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchLearnedLinkDto _$SearchLearnedLinkDtoFromJson(
  Map<String, dynamic> json,
) => SearchLearnedLinkDto(
  q: json['q'] as String,
  practiceCode: json['practiceCode'] as String,
  score: json['score'] as num,
);

Map<String, dynamic> _$SearchLearnedLinkDtoToJson(
  SearchLearnedLinkDto instance,
) => <String, dynamic>{
  'q': instance.q,
  'practiceCode': instance.practiceCode,
  'score': instance.score,
};
