// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_payroll_employee_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePayrollEmployeeDto _$CreatePayrollEmployeeDtoFromJson(
  Map<String, dynamic> json,
) => CreatePayrollEmployeeDto(
  name: json['name'] as String,
  amountCents: (json['amountCents'] as num).toInt(),
  currency: json['currency'] as String? ?? 'usd',
  roleTitle: json['roleTitle'] as String?,
  adminUserId: json['adminUserId'] as String?,
  methodNote: json['methodNote'] as String?,
  email: json['email'] as String?,
);

Map<String, dynamic> _$CreatePayrollEmployeeDtoToJson(
  CreatePayrollEmployeeDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'roleTitle': ?instance.roleTitle,
  'adminUserId': ?instance.adminUserId,
  'amountCents': instance.amountCents,
  'currency': instance.currency,
  'methodNote': ?instance.methodNote,
  'email': ?instance.email,
};
