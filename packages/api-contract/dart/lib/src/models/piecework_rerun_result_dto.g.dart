// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_rerun_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkRerunResultDto _$PieceworkRerunResultDtoFromJson(
  Map<String, dynamic> json,
) => PieceworkRerunResultDto(
  day: json['day'] as String,
  admins: (json['admins'] as num).toInt(),
  accrued: (json['accrued'] as num).toInt(),
  totalCents: (json['totalCents'] as num).toInt(),
  skippedNoPayroll: (json['skippedNoPayroll'] as num).toInt(),
  skippedDisputed: (json['skippedDisputed'] as num).toInt(),
  noRating: (json['noRating'] as num).toInt(),
  paidDiffs: (json['paidDiffs'] as List<dynamic>)
      .map((e) => PieceworkPaidDiffDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$PieceworkRerunResultDtoToJson(
  PieceworkRerunResultDto instance,
) => <String, dynamic>{
  'day': instance.day,
  'admins': instance.admins,
  'accrued': instance.accrued,
  'totalCents': instance.totalCents,
  'skippedNoPayroll': instance.skippedNoPayroll,
  'skippedDisputed': instance.skippedDisputed,
  'noRating': instance.noRating,
  'paidDiffs': instance.paidDiffs.map((e) => e.toJson()).toList(),
};
