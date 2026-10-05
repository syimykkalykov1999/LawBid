// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatSummaryDto _$SeatSummaryDtoFromJson(Map<String, dynamic> json) =>
    SeatSummaryDto(
      included: (json['included'] as num).toInt(),
      extra: (json['extra'] as num).toInt(),
      total: (json['total'] as num).toInt(),
      max: (json['max'] as num).toInt(),
    );

Map<String, dynamic> _$SeatSummaryDtoToJson(SeatSummaryDto instance) =>
    <String, dynamic>{
      'included': instance.included,
      'extra': instance.extra,
      'total': instance.total,
      'max': instance.max,
    };
