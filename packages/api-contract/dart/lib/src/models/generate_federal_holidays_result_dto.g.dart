// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'generate_federal_holidays_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GenerateFederalHolidaysResultDto _$GenerateFederalHolidaysResultDtoFromJson(
  Map<String, dynamic> json,
) => GenerateFederalHolidaysResultDto(
  created: (json['created'] as num).toInt(),
  existing: (json['existing'] as num).toInt(),
);

Map<String, dynamic> _$GenerateFederalHolidaysResultDtoToJson(
  GenerateFederalHolidaysResultDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'existing': instance.existing,
};
