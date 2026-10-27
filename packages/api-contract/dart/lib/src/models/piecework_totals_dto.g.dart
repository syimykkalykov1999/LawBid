// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_totals_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkTotalsDto _$PieceworkTotalsDtoFromJson(Map<String, dynamic> json) =>
    PieceworkTotalsDto(
      people: (json['people'] as num).toInt(),
      units: (json['units'] as num).toInt(),
      heldUnits: (json['heldUnits'] as num).toInt(),
      amountCents: (json['amountCents'] as num).toInt(),
    );

Map<String, dynamic> _$PieceworkTotalsDtoToJson(PieceworkTotalsDto instance) =>
    <String, dynamic>{
      'people': instance.people,
      'units': instance.units,
      'heldUnits': instance.heldUnits,
      'amountCents': instance.amountCents,
    };
