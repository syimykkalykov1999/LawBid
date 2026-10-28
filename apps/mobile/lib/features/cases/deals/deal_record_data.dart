import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/tools/signing_data.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md):
/// data of the record both parties sign before a bid is really accepted.
/// Both admin switches travel in `GET /config/bootstrap.app_config`
/// (`deal_record.enabled`, `bids.rich_terms_enabled`), off by default.
final dealRecordEnabledProvider = Provider<bool>(
  (ref) =>
      ref
          .watch(featureFlagsControllerProvider)
          .appConfig['deal_record.enabled'] ==
      'true',
);

final richTermsEnabledProvider = Provider<bool>(
  (ref) =>
      ref
          .watch(featureFlagsControllerProvider)
          .appConfig['bids.rich_terms_enabled'] ==
      'true',
);

final dealRecordsClientProvider = Provider<api.DealRecordsClient>(
  (ref) => api.DealRecordsClient(ref.watch(dioProvider)),
);

/// One record by id (the signing screen).
final dealRecordProvider =
    FutureProvider.autoDispose.family<api.DealRecordDto, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(dealRecordsClientProvider).getDealRecord(id: id),
  ))
      .data,
);

/// The case's current record, or null (Docs tab card, overview, bid screen).
/// Null without a request while the switch is off.
final caseDealRecordProvider =
    FutureProvider.autoDispose.family<api.DealRecordDto?, String>(
  (ref, caseId) async {
    if (!ref.watch(dealRecordEnabledProvider)) return null;
    return (await guardApiCall(
      () => ref.watch(dealRecordsClientProvider).currentDealRecord(id: caseId),
    ))
        .data
        .record;
  },
);

class DealRecordActions {
  DealRecordActions(this._ref, this._c);

  final Ref _ref;
  final api.DealRecordsClient _c;

  void _refresh(api.DealRecordDto r) {
    _ref
      ..invalidate(dealRecordProvider(r.id))
      ..invalidate(caseDealRecordProvider(r.caseId))
      ..invalidate(signRequestsProvider(r.caseId));
  }

  /// "Accept" while the switch is on: creates the record (status preparing).
  Future<api.DealRecordDto> start(String bidId) async {
    final r = (await guardApiCall(
      () => _c.startDealRecord(body: api.CreateDealRecordDto(bidId: bidId)),
    ))
        .data;
    _refresh(r);
    return r;
  }

  Future<api.DealRecordDto> sign(
    String id, {
    required String name,
    required String imagePngBase64,
  }) async {
    final r = (await guardApiCall(
      () => _c.signDealRecord(
        id: id,
        body: api.SignDealRecordDto(name: name, imagePngBase64: imagePngBase64),
      ),
    ))
        .data;
    _refresh(r);
    return r;
  }

  Future<api.DealRecordDto> decline(String id, {String? reason}) async {
    final r = (await guardApiCall(
      () => _c.declineDealRecord(
        id: id,
        body: api.DeclineDealRecordDto(reason: reason),
      ),
    ))
        .data;
    _refresh(r);
    return r;
  }

  Future<api.DealRecordDto> attachAgreement(String id, String fileId) async {
    final r = (await guardApiCall(
      () => _c.attachAgreement(
        id: id,
        body: api.AttachAgreementDto(fileId: fileId),
      ),
    ))
        .data;
    _refresh(r);
    return r;
  }
}

final dealRecordActionsProvider = Provider<DealRecordActions>(
  (ref) => DealRecordActions(ref, ref.watch(dealRecordsClientProvider)),
);
