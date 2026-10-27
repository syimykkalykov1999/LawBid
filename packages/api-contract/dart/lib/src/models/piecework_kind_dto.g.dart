// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_kind_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkKindDto _$PieceworkKindDtoFromJson(Map<String, dynamic> json) =>
    PieceworkKindDto(
      kind: PieceworkKindDtoKind.fromJson(json['kind'] as String),
      units: (json['units'] as num).toInt(),
      heldUnits: (json['heldUnits'] as num).toInt(),
      rateCents: (json['rateCents'] as num).toInt(),
      amountCents: (json['amountCents'] as num).toInt(),
    );

Map<String, dynamic> _$PieceworkKindDtoToJson(PieceworkKindDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'units': instance.units,
      'heldUnits': instance.heldUnits,
      'rateCents': instance.rateCents,
      'amountCents': instance.amountCents,
    };
