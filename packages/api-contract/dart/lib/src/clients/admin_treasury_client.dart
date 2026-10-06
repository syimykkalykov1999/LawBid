// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_treasury_expense_dto.dart';
import '../models/treasury_overview_envelope.dart';
import '../models/treasury_run_result_envelope.dart';
import '../models/update_treasury_expense_dto.dart';
import '../models/update_treasury_settings_dto.dart';

part 'admin_treasury_client.g.dart';

@RestApi()
abstract class AdminTreasuryClient {
  factory AdminTreasuryClient(Dio dio, {String? baseUrl}) =
      _AdminTreasuryClient;

  /// Stripe balance, reserve, next split, expenses, payouts
  @GET('/admin/treasury')
  Future<TreasuryOverviewEnvelope> getTreasury({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Auto split, payout day, buffers, pay day (needs step-up)
  @PUT('/admin/treasury/settings')
  Future<TreasuryOverviewEnvelope> updateTreasurySettings({
    @Body() required UpdateTreasurySettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Split the balance now: the computed amounts only (step-up)
  @POST('/admin/treasury/run')
  Future<TreasuryRunResultEnvelope> runTreasuryNow({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a service the expense card pays monthly
  @POST('/admin/treasury/expenses')
  Future<TreasuryOverviewEnvelope> createTreasuryExpense({
    @Body() required CreateTreasuryExpenseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change a monthly expense or switch it off
  @PATCH('/admin/treasury/expenses/{id}')
  Future<TreasuryOverviewEnvelope> updateTreasuryExpense({
    @Path('id') required String id,
    @Body() required UpdateTreasuryExpenseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a monthly expense
  @DELETE('/admin/treasury/expenses/{id}')
  Future<TreasuryOverviewEnvelope> deleteTreasuryExpense({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
