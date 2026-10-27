// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkPersonDto _$PieceworkPersonDtoFromJson(Map<String, dynamic> json) =>
    PieceworkPersonDto(
      adminId: json['adminId'] as String,
      name: json['name'] as String,
      workspace: PieceworkPersonDtoWorkspace.fromJson(
        json['workspace'] as String,
      ),
      units: (json['units'] as num).toInt(),
      heldUnits: (json['heldUnits'] as num).toInt(),
      days: (json['days'] as List<dynamic>)
          .map((e) => PieceworkDayDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      amountCents: json['amountCents'] as num?,
    );

Map<String, dynamic> _$PieceworkPersonDtoToJson(PieceworkPersonDto instance) =>
    <String, dynamic>{
      'adminId': instance.adminId,
      'name': instance.name,
      'workspace': instance.workspace.toJson(),
      'units': instance.units,
      'heldUnits': instance.heldUnits,
      'amountCents': ?instance.amountCents,
      'days': instance.days.map((e) => e.toJson()).toList(),
    };
