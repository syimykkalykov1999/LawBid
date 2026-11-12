// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_ai_items_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewAiItemsDto _$ReviewAiItemsDtoFromJson(Map<String, dynamic> json) =>
    ReviewAiItemsDto(
      ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
      verdict: AiWorkerVerdict.fromJson(json['verdict'] as String),
      ownerDecision: json['ownerDecision'] == null
          ? null
          : AiWorkerDecision.fromJson(json['ownerDecision'] as String),
      ownerNote: json['ownerNote'] as String?,
    );

Map<String, dynamic> _$ReviewAiItemsDtoToJson(ReviewAiItemsDto instance) =>
    <String, dynamic>{
      'ids': instance.ids,
      'verdict': instance.verdict.toJson(),
      'ownerDecision': ?instance.ownerDecision?.toJson(),
      'ownerNote': ?instance.ownerNote,
    };
