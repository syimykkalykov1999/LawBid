// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/hotline_accepting_dto.dart';
import '../models/hotline_claim_dto.dart';
import '../models/hotline_config_envelope.dart';
import '../models/hotline_counters_envelope.dart';
import '../models/hotline_end_envelope.dart';
import '../models/hotline_languages_dto.dart';
import '../models/hotline_line_dto.dart';
import '../models/hotline_line_view_envelope.dart';
import '../models/hotline_notify_me_dto.dart';
import '../models/hotline_offer_result_envelope.dart';
import '../models/hotline_request_dto.dart';
import '../models/hotline_request_view_envelope.dart';

part 'hotline_client.g.dart';

@RestApi()
abstract class HotlineClient {
  factory HotlineClient(Dio dio, {String? baseUrl}) = _HotlineClient;

  /// Hotline switches and numbers for the app
  @GET('/hotline/config')
  Future<HotlineConfigEnvelope> hotlineConfig({
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Ожидать звонки»: on the line with these filters
  @PUT('/hotline/line')
  Future<HotlineLineViewEnvelope> hotlineLineOn({
    @Body() required HotlineLineDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Выключить линию»
  @DELETE('/hotline/line')
  Future<HotlineLineViewEnvelope> hotlineLineOff({
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Принимать звонки» on / off (⋯ menu in a call)
  @POST('/hotline/line/accepting')
  Future<HotlineLineViewEnvelope> hotlineSetAccepting({
    @Body() required HotlineAcceptingDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// REST fallback of the socket `hotline:heartbeat` (screen open)
  @POST('/hotline/heartbeat')
  Future<HotlineEndEnvelope> hotlineHeartbeat({
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Взять» (idempotent); billing starts here
  @POST('/hotline/offers/{id}/accept')
  Future<HotlineOfferResultEnvelope> hotlineAcceptOffer({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Пропустить»: the call goes to the next attorney
  @POST('/hotline/offers/{id}/decline')
  Future<HotlineOfferResultEnvelope> hotlineDeclineOffer({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// End a hotline call (either side, idempotent)
  @POST('/hotline/calls/{id}/end')
  Future<HotlineEndEnvelope> hotlineEndCall({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Связаться с адвокатом» (one active request per client)
  @POST('/hotline/requests')
  Future<HotlineRequestViewEnvelope> hotlineCreateRequest({
    @Body() required HotlineRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My request (ETag / 304 for polling)
  @GET('/hotline/requests/{id}')
  Future<HotlineRequestViewEnvelope> hotlineGetRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Выйти из очереди» / cancel
  @DELETE('/hotline/requests/{id}')
  Future<HotlineRequestViewEnvelope> hotlineCancelRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Поменять язык» while waiting (keeps the place)
  @PATCH('/hotline/requests/{id}')
  Future<HotlineRequestViewEnvelope> hotlineChangeLanguages({
    @Path('id') required String id,
    @Body() required HotlineLanguagesDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Сообщите, когда появится адвокат»: leave, keep the place
  @POST('/hotline/requests/{id}/notify-me')
  Future<HotlineRequestViewEnvelope> hotlineNotifyMe({
    @Path('id') required String id,
    @Body() required HotlineNotifyMeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Позвонить сейчас»: online again with the original time
  @POST('/hotline/requests/{id}/claim')
  Future<HotlineRequestViewEnvelope> hotlineClaim({
    @Path('id') required String id,
    @Body() HotlineClaimDto? body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Banded «адвокатов / клиентов» of buckets (ETag / 304, 5 s).
  ///
  /// [keys] - Comma list: b:<state~practice~lang> or l:<lang> (≤ 20).
  @GET('/hotline/counters')
  Future<HotlineCountersEnvelope> hotlineCounters({
    @Query('keys') required dynamic keys,
    @Extras() Map<String, dynamic>? extras,
  });
}
