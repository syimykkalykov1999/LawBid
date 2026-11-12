// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_queue_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerQueueDto _$AiWorkerQueueDtoFromJson(Map<String, dynamic> json) =>
    AiWorkerQueueDto(
      key: AiWorkerQueueKey.fromJson(json['key'] as String),
      label: json['label'] as String,
    );

Map<String, dynamic> _$AiWorkerQueueDtoToJson(AiWorkerQueueDto instance) =>
    <String, dynamic>{'key': instance.key.toJson(), 'label': instance.label};
