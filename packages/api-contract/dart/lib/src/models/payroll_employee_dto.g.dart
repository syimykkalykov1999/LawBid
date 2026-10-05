// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_employee_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollEmployeeDto _$PayrollEmployeeDtoFromJson(Map<String, dynamic> json) =>
    PayrollEmployeeDto(
      id: json['id'] as String,
      name: json['name'] as String,
      roleTitle: json['roleTitle'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      currency: json['currency'] as String,
      methodNote: json['methodNote'] as String,
      stripeLinked: json['stripeLinked'] as bool,
      stripePayoutsEnabled: json['stripePayoutsEnabled'] as bool,
      active: json['active'] as bool,
      pendingCents: (json['pendingCents'] as num).toInt(),
      createdAt: json['createdAt'] as String,
      adminUserId: json['adminUserId'] as String?,
      email: json['email'] as String?,
      lastPaidPeriod: json['lastPaidPeriod'] as String?,
      userId: json['userId'] as String?,
    );

Map<String, dynamic> _$PayrollEmployeeDtoToJson(PayrollEmployeeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'adminUserId': ?instance.adminUserId,
      'name': instance.name,
      'roleTitle': instance.roleTitle,
      'amountCents': instance.amountCents,
      'currency': instance.currency,
      'methodNote': instance.methodNote,
      'email': ?instance.email,
      'stripeLinked': instance.stripeLinked,
      'stripePayoutsEnabled': instance.stripePayoutsEnabled,
      'active': instance.active,
      'lastPaidPeriod': ?instance.lastPaidPeriod,
      'userId': ?instance.userId,
      'pendingCents': instance.pendingCents,
      'createdAt': instance.createdAt,
    };
