// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'queue_retry_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QueueRetryResultDto _$QueueRetryResultDtoFromJson(Map<String, dynamic> json) =>
    QueueRetryResultDto(
      retried: json['retried'] as num,
      stripeReplayed: json['stripeReplayed'] as num,
      byQueue: Map<String, num>.from(json['byQueue'] as Map),
    );

Map<String, dynamic> _$QueueRetryResultDtoToJson(
  QueueRetryResultDto instance,
) => <String, dynamic>{
  'retried': instance.retried,
  'stripeReplayed': instance.stripeReplayed,
  'byQueue': instance.byQueue,
};
