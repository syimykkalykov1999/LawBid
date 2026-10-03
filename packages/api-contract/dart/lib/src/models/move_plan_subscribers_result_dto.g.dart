// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'move_plan_subscribers_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MovePlanSubscribersResultDto _$MovePlanSubscribersResultDtoFromJson(
  Map<String, dynamic> json,
) => MovePlanSubscribersResultDto(
  moved: (json['moved'] as num).toInt(),
  skipped: (json['skipped'] as num).toInt(),
  failed: (json['failed'] as num).toInt(),
);

Map<String, dynamic> _$MovePlanSubscribersResultDtoToJson(
  MovePlanSubscribersResultDto instance,
) => <String, dynamic>{
  'moved': instance.moved,
  'skipped': instance.skipped,
  'failed': instance.failed,
};
