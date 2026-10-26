// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_employee_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollEmployeeListEnvelope _$PayrollEmployeeListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayrollEmployeeListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PayrollEmployeeDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayrollEmployeeListEnvelopeToJson(
  PayrollEmployeeListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
