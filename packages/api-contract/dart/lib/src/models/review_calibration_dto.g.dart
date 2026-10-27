// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_calibration_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewCalibrationDto _$ReviewCalibrationDtoFromJson(
  Map<String, dynamic> json,
) => ReviewCalibrationDto(
  decisionKind: json['decisionKind'] as String,
  pairs: json['pairs'] as num,
  agreementPct: json['agreementPct'] as num?,
);

Map<String, dynamic> _$ReviewCalibrationDtoToJson(
  ReviewCalibrationDto instance,
) => <String, dynamic>{
  'decisionKind': instance.decisionKind,
  'pairs': instance.pairs,
  'agreementPct': ?instance.agreementPct,
};
