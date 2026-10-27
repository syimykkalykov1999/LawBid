// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkDayDto _$PieceworkDayDtoFromJson(Map<String, dynamic> json) =>
    PieceworkDayDto(
      day: json['day'] as String,
      units: (json['units'] as num).toInt(),
      heldUnits: (json['heldUnits'] as num).toInt(),
      qualityMult: json['qualityMult'] as num,
      amountCents: (json['amountCents'] as num).toInt(),
      status: PieceworkDayDtoStatus.fromJson(json['status'] as String),
      noRating: json['noRating'] as bool,
      kinds: (json['kinds'] as List<dynamic>?)
          ?.map((e) => PieceworkKindDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PieceworkDayDtoToJson(PieceworkDayDto instance) =>
    <String, dynamic>{
      'day': instance.day,
      'units': instance.units,
      'heldUnits': instance.heldUnits,
      'qualityMult': instance.qualityMult,
      'amountCents': instance.amountCents,
      'status': instance.status.toJson(),
      'noRating': instance.noRating,
      'kinds': ?instance.kinds?.map((e) => e.toJson()).toList(),
    };
