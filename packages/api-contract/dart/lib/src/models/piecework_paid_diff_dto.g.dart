// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_paid_diff_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkPaidDiffDto _$PieceworkPaidDiffDtoFromJson(
  Map<String, dynamic> json,
) => PieceworkPaidDiffDto(
  adminId: json['adminId'] as String,
  deltaCents: (json['deltaCents'] as num).toInt(),
);

Map<String, dynamic> _$PieceworkPaidDiffDtoToJson(
  PieceworkPaidDiffDto instance,
) => <String, dynamic>{
  'adminId': instance.adminId,
  'deltaCents': instance.deltaCents,
};
