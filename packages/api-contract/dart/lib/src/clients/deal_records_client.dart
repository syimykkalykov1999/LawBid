// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/attach_agreement_dto.dart';
import '../models/create_deal_record_dto.dart';
import '../models/deal_record_envelope.dart';
import '../models/deal_record_lookup_envelope.dart';
import '../models/decline_deal_record_dto.dart';
import '../models/sign_deal_record_dto.dart';

part 'deal_records_client.g.dart';

@RestApi()
abstract class DealRecordsClient {
  factory DealRecordsClient(Dio dio, {String? baseUrl}) = _DealRecordsClient;

  /// Accept a bid through the deal record: creates the record (status preparing) and renders the PDF in the background. The bid is accepted only after both signatures.
  @POST('/deal-records')
  Future<DealRecordEnvelope> startDealRecord({
    @Body() required CreateDealRecordDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A deal record (both parties)
  @GET('/deal-records/{id}')
  Future<DealRecordEnvelope> getDealRecord({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The case's current deal record (live, else the sealed one), or null — for the Docs tab card and the bid screen
  @GET('/cases/{id}/deal-record')
  Future<DealRecordLookupEnvelope> currentDealRecord({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Draw-sign the record (the acceptor first, then the other party). The second signature accepts the bid for real and seals the record.
  @POST('/deal-records/{id}/sign')
  Future<DealRecordEnvelope> signDealRecord({
    @Path('id') required String id,
    @Body() required SignDealRecordDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Either party declines before the second signature: nothing was accepted, the bid and the case stay as they were.
  @POST('/deal-records/{id}/decline')
  Future<DealRecordEnvelope> declineDealRecord({
    @Path('id') required String id,
    @Body() required DeclineDealRecordDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The attorney links their own agreement PDF (an uploaded case file) to the sealed record.
  @POST('/deal-records/{id}/agreement')
  Future<DealRecordEnvelope> attachAgreement({
    @Path('id') required String id,
    @Body() required AttachAgreementDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
