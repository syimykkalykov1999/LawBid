// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_payroll_accrual_dto.dart';
import '../models/create_payroll_employee_dto.dart';
import '../models/payroll_accrual_envelope.dart';
import '../models/payroll_accrual_list_envelope.dart';
import '../models/payroll_bulk_pay_dto.dart';
import '../models/payroll_bulk_result_envelope.dart';
import '../models/payroll_cancel_dto.dart';
import '../models/payroll_employee_envelope.dart';
import '../models/payroll_employee_list_envelope.dart';
import '../models/payroll_payout_envelope.dart';
import '../models/payroll_payout_list_envelope.dart';
import '../models/payroll_stripe_link_envelope.dart';
import '../models/payroll_summary_envelope.dart';
import '../models/status8.dart';
import '../models/update_payroll_employee_dto.dart';

part 'admin_payroll_client.g.dart';

@RestApi()
abstract class AdminPayrollClient {
  factory AdminPayrollClient(Dio dio, {String? baseUrl}) = _AdminPayrollClient;

  /// People on payroll with their fixed amount.
  ///
  /// [includeInactive] - Also show people taken off payroll.
  @GET('/admin/payroll/employees')
  Future<PayrollEmployeeListEnvelope> listPayrollEmployees({
    @Query('includeInactive') bool? includeInactive,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a person to payroll
  @POST('/admin/payroll/employees')
  Future<PayrollEmployeeEnvelope> createPayrollEmployee({
    @Body() required CreatePayrollEmployeeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change amount, details or take off payroll
  @PATCH('/admin/payroll/employees/{id}')
  Future<PayrollEmployeeEnvelope> updatePayrollEmployee({
    @Path('id') required String id,
    @Body() required UpdatePayrollEmployeeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stripe link where the person adds their bank account or card (payroll_stripe_payouts)
  @POST('/admin/payroll/employees/{id}/stripe-link')
  Future<PayrollStripeLinkEnvelope> payrollStripeLink({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Monthly total and what is paid for a period
  @GET('/admin/payroll/summary')
  Future<PayrollSummaryEnvelope> payrollSummary({
    @Query('period') required String period,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Payments, newest first (by period / person)
  @GET('/admin/payroll/payouts')
  Future<PayrollPayoutListEnvelope> listPayrollPayouts({
    @Query('period') String? period,
    @Query('employeeId') String? employeeId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pay many people for a period: fixed salary (once per period) plus pending commissions; via Stripe its fee is taken from each payout
  @POST('/admin/payroll/payouts/bulk')
  Future<PayrollBulkResultEnvelope> payPayrollBulk({
    @Body() required PayrollBulkPayDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cancel a payment recorded by mistake
  @POST('/admin/payroll/payouts/{id}/cancel')
  Future<PayrollPayoutEnvelope> cancelPayrollPayout({
    @Path('id') required String id,
    @Body() required PayrollCancelDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Commissions, bonuses and adjustments (newest first)
  @GET('/admin/payroll/accruals')
  Future<PayrollAccrualListEnvelope> listPayrollAccruals({
    @Query('employeeId') String? employeeId,
    @Query('status') Status8? status,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a bonus or adjustment, paid with the next payout
  @POST('/admin/payroll/employees/{id}/accruals')
  Future<PayrollAccrualEnvelope> addPayrollAccrual({
    @Path('id') required String id,
    @Body() required CreatePayrollAccrualDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take back a pending accrual
  @POST('/admin/payroll/accruals/{id}/cancel')
  Future<PayrollAccrualEnvelope> cancelPayrollAccrual({
    @Path('id') required String id,
    @Body() required PayrollCancelDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
