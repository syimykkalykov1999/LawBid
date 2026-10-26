// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'active_grant_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ActiveGrantSummaryDto _$ActiveGrantSummaryDtoFromJson(
  Map<String, dynamic> json,
) => ActiveGrantSummaryDto(
  id: json['id'] as String,
  endsAt: DateTime.parse(json['endsAt'] as String),
  assistantSeats: (json['assistantSeats'] as num).toInt(),
);

Map<String, dynamic> _$ActiveGrantSummaryDtoToJson(
  ActiveGrantSummaryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'endsAt': instance.endsAt.toIso8601String(),
  'assistantSeats': instance.assistantSeats,
};
