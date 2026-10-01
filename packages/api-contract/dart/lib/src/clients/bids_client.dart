// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/bid_draft_body_dto.dart';
import '../models/bid_draft_envelope.dart';
import '../models/bid_envelope.dart';
import '../models/counter_offer_dto.dart';
import '../models/create_bid_dto.dart';

part 'bids_client.g.dart';

@RestApi()
abstract class BidsClient {
  factory BidsClient(Dio dio, {String? baseUrl}) = _BidsClient;

  /// Place a bid on an open case (attorney)
  @POST('/cases/{caseId}/bids')
  Future<BidEnvelope> createBid({
    @Path('caseId') required String caseId,
    @Body() required CreateBidDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Bid details and full negotiation history
  @GET('/bids/{id}')
  Future<BidEnvelope> getBid({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Withdraw a bid (attorney, while active)
  @POST('/bids/{id}/withdraw')
  Future<BidEnvelope> withdraw({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Decline a bid (client)
  @POST('/bids/{id}/decline')
  Future<BidEnvelope> decline({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Counter-offer, whichever party's turn it is (max 5 rounds)
  @POST('/bids/{id}/counter')
  Future<BidEnvelope> counter({
    @Path('id') required String id,
    @Body() required CounterOfferDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accept a bid (whichever party's turn it is): case → in_progress, other bids auto-rejected, contacts disclosed
  @POST('/bids/{id}/accept')
  Future<BidEnvelope> acceptBid({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The bid draft prepared for this case
  @GET('/cases/{id}/bid-draft')
  Future<BidDraftEnvelope> getBidDraft({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save a bid draft (the attorney reviews and sends)
  @PUT('/cases/{id}/bid-draft')
  Future<BidDraftEnvelope> saveBidDraft({
    @Path('id') required String id,
    @Body() required BidDraftBodyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Discard the bid draft
  @DELETE('/cases/{id}/bid-draft')
  Future<void> deleteBidDraft({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
