// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_suppressions_add_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSuppressionsAddResultDto _$OutreachSuppressionsAddResultDtoFromJson(
  Map<String, dynamic> json,
) => OutreachSuppressionsAddResultDto(
  added: json['added'] as num,
  leadsMarked: json['leadsMarked'] as num,
  invalid: json['invalid'] as num,
);

Map<String, dynamic> _$OutreachSuppressionsAddResultDtoToJson(
  OutreachSuppressionsAddResultDto instance,
) => <String, dynamic>{
  'added': instance.added,
  'leadsMarked': instance.leadsMarked,
  'invalid': instance.invalid,
};
