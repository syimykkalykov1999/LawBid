// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_suppressions_add_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSuppressionsAddDto _$OutreachSuppressionsAddDtoFromJson(
  Map<String, dynamic> json,
) => OutreachSuppressionsAddDto(
  values: (json['values'] as List<dynamic>).map((e) => e as String).toList(),
  note: json['note'] as String?,
);

Map<String, dynamic> _$OutreachSuppressionsAddDtoToJson(
  OutreachSuppressionsAddDto instance,
) => <String, dynamic>{'values': instance.values, 'note': ?instance.note};
