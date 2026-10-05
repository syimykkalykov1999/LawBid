// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_employee_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollEmployeeEnvelope _$PayrollEmployeeEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayrollEmployeeEnvelope(
  data: PayrollEmployeeDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayrollEmployeeEnvelopeToJson(
  PayrollEmployeeEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
