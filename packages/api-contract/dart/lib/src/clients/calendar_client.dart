// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/calendar_connect_start_envelope.dart';
import '../models/calendar_connection_envelope.dart';
import '../models/calendar_feed_link_envelope.dart';
import '../models/calendar_feed_status_envelope.dart';
import '../models/calendar_providers_envelope.dart';
import '../models/provider2.dart';
import '../models/update_calendar_connection_dto.dart';

part 'calendar_client.g.dart';

@RestApi()
abstract class CalendarClient {
  factory CalendarClient(Dio dio, {String? baseUrl}) = _CalendarClient;

  /// Do I have a calendar link? (the link itself is never shown again)
  @GET('/calendar/feed')
  Future<CalendarFeedStatusEnvelope> feedStatus({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a new secret calendar link; the old one stops working. The link is returned once.
  @POST('/calendar/feed')
  Future<CalendarFeedLinkEnvelope> createFeed({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Revoke the calendar link
  @DELETE('/calendar/feed')
  Future<void> deleteFeed({@Extras() Map<String, dynamic>? extras});

  /// The .ics feed (secret link, no login)
  @GET('/calendar/feed/{file}')
  Future<void> feedFile({
    @Path('file') required String file,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A one-event .ics file from a signed link
  @GET('/calendar/event.ics')
  Future<void> eventIcs({
    @Query('d') required String d,
    @Query('sig') required String sig,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Linked Google / Outlook calendars and which links are on
  @GET('/calendar/connections')
  Future<CalendarProvidersEnvelope> listConnections({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Step 1 of linking: the vendor sign-in page to open
  @POST('/calendar/connections/{provider}/start')
  Future<CalendarConnectStartEnvelope> startConnection({
    @Path('provider') required Provider2 provider,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Choose what the link does (busy time / write events)
  @PATCH('/calendar/connections/{provider}')
  Future<CalendarConnectionEnvelope> updateConnection({
    @Path('provider') required Provider2 provider,
    @Body() required UpdateCalendarConnectionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unlink the calendar (the sign-in is revoked where possible)
  @DELETE('/calendar/connections/{provider}')
  Future<void> disconnectConnection({
    @Path('provider') required Provider2 provider,
    @Extras() Map<String, dynamic>? extras,
  });

  /// OAuth return address (the vendor calls it)
  @GET('/calendar/oauth/{provider}/callback')
  Future<void> oauthCallback({
    @Path('provider') required String provider,
    @Query('code') String? code,
    @Query('state') String? state,
    @Query('error') String? error,
    @Extras() Map<String, dynamic>? extras,
  });
}
