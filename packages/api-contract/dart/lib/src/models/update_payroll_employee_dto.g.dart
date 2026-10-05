// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_payroll_employee_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdatePayrollEmployeeDto _$UpdatePayrollEmployeeDtoFromJson(
  Map<String, dynamic> json,
) => UpdatePayrollEmployeeDto(
  name: json['name'] as String?,
  roleTitle: json['roleTitle'] as String?,
  amountCents: (json['amountCents'] as num?)?.toInt(),
  currency: json['currency'] as String?,
  methodNote: json['methodNote'] as String?,
  email: json['email'] as String?,
  active: json['active'] as bool?,
);

Map<String, dynamic> _$UpdatePayrollEmployeeDtoToJson(
  UpdatePayrollEmployeeDto instance,
) => <String, dynamic>{
  'name': ?instance.name,
  'roleTitle': ?instance.roleTitle,
  'amountCents': ?instance.amountCents,
  'currency': ?instance.currency,
  'methodNote': ?instance.methodNote,
  'email': ?instance.email,
  'active': ?instance.active,
};
