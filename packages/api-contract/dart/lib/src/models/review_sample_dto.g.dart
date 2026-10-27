// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_sample_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewSampleDto _$ReviewSampleDtoFromJson(Map<String, dynamic> json) =>
    ReviewSampleDto(
      id: json['id'] as String,
      decisionKind: json['decisionKind'] as String,
      itemId: json['itemId'] as String,
      stage: json['stage'] as String?,
      outcome: json['outcome'] as String?,
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
      handleSec: json['handleSec'] as num?,
      facts: (json['facts'] as List<dynamic>)
          .map((e) => ReviewFactDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      leasedUntil: DateTime.parse(json['leasedUntil'] as String),
      worker: json['worker'] == null
          ? null
          : ReviewPersonRefDto.fromJson(json['worker'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReviewSampleDtoToJson(ReviewSampleDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'decisionKind': instance.decisionKind,
      'itemId': instance.itemId,
      'stage': ?instance.stage,
      'outcome': ?instance.outcome,
      'decidedAt': ?instance.decidedAt?.toIso8601String(),
      'handleSec': ?instance.handleSec,
      'facts': instance.facts.map((e) => e.toJson()).toList(),
      'leasedUntil': instance.leasedUntil.toIso8601String(),
      'worker': ?instance.worker?.toJson(),
    };
