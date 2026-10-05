// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_employee_dto.dart';
import 'response_meta_dto.dart';

part 'payroll_employee_list_envelope.g.dart';

@JsonSerializable()
class PayrollEmployeeListEnvelope {
  const PayrollEmployeeListEnvelope({required this.data, this.meta});

  factory PayrollEmployeeListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PayrollEmployeeListEnvelopeFromJson(json);

  final List<PayrollEmployeeDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PayrollEmployeeListEnvelopeToJson(this);
}
