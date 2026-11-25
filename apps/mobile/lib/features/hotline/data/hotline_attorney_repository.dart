import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner row 87 (hotline plan step 6): the attorney's side of `/hotline`
/// (the generated client; the live parts come over the socket).
abstract interface class HotlineAttorneyRepository {
  Future<HotlineAttorneyConfig> config();

  /// «Ожидать звонки» (PUT /hotline/line).
  Future<HotlineLine> lineOn({
    required List<String> states,
    required List<String> practiceAreas,
    required List<String> languages,
    bool accepting = true,
  });

  /// «Выключить линию».
  Future<HotlineLine> lineOff();

  /// After a reconnect while the screen is still open.
  Future<HotlineLine> resume();

  /// «Принимать звонки» (the «⋯» menu of a call).
  Future<HotlineLine> setAccepting({required bool on});

  /// REST fallback of the socket heartbeat; the waiting client, if any.
  Future<(bool ok, Object? waiting)> heartbeat();

  /// «Ответить» → the call id (null: too late, another attorney got it).
  Future<String?> accept(String requestId);

  /// «Отклонить» → the next attorney.
  Future<void> decline(String requestId);

  /// Ends the hotline call (either side, idempotent).
  Future<void> endCall(String requestId);

  /// Banded «клиентов / адвокатов» of `l:<lang>` / `b:<bucket>` keys.
  Future<List<HotlineLineCounter>> counters(List<String> keys);

  /// «Понятно» under the one-time disclosure.
  Future<void> ackDisclosure(int version);
}

class ApiHotlineAttorneyRepository implements HotlineAttorneyRepository {
  ApiHotlineAttorneyRepository(Dio dio) : _api = api.HotlineClient(dio);

  final api.HotlineClient _api;

  static HotlineLine _line(api.HotlineLineViewDto d) => HotlineLine(
        online: d.online,
        state: d.state.json ?? 'off',
        accepting: d.accepting,
        states: d.states,
        practiceAreas: d.practiceAreas,
        languages: d.languages,
        heartbeatSec: d.heartbeatSec.toInt(),
      );

  @override
  Future<HotlineAttorneyConfig> config() async {
    final d = (await guardApiCall(_api.hotlineConfig)).data;
    final a = d.access;
    return HotlineAttorneyConfig(
      enabled: d.enabled,
      mode: HotlineLineMode.parse(d.mode?.json),
      heartbeatSec: d.heartbeatSec.toInt(),
      offerTimeoutSec: d.offerTimeoutSec.toInt(),
      countersIntervalSec: d.countersIntervalSec.toInt(),
      // an older server sends nothing: its own cap was 50
      attorneyMaxLanguages: d.attorneyMaxLanguages?.toInt() ?? 50,
      access: a == null
          ? null
          : HotlineAccess(
              allowed: a.allowed,
              via: a.via?.json,
              reason: a.reason,
            ),
      disclosure: HotlineAttorneyDisclosure(
        version: d.disclosure.version.toInt(),
        key: d.disclosure.key,
        ru: d.disclosure.ru,
        en: d.disclosure.en,
      ),
    );
  }

  @override
  Future<HotlineLine> lineOn({
    required List<String> states,
    required List<String> practiceAreas,
    required List<String> languages,
    bool accepting = true,
  }) async =>
      _line(
        (await guardApiCall(
          () => _api.hotlineLineOn(
            body: api.HotlineLineDto(
              states: states,
              practiceAreas: practiceAreas,
              languages: languages,
              accepting: accepting,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<HotlineLine> lineOff() async =>
      _line((await guardApiCall(_api.hotlineLineOff)).data);

  @override
  Future<HotlineLine> resume() async =>
      _line((await guardApiCall(_api.hotlineLineResume)).data);

  @override
  Future<HotlineLine> setAccepting({required bool on}) async => _line(
        (await guardApiCall(
          () => _api.hotlineSetAccepting(
            body: api.HotlineAcceptingDto(accepting: on),
          ),
        ))
            .data,
      );

  @override
  Future<(bool, Object?)> heartbeat() async {
    final d = (await guardApiCall(_api.hotlineHeartbeat)).data;
    return (d.ok, d.waiting?.toJson());
  }

  @override
  Future<String?> accept(String requestId) async {
    final d =
        (await guardApiCall(() => _api.hotlineAcceptOffer(id: requestId))).data;
    return d.ok ? d.callId : null;
  }

  @override
  Future<void> decline(String requestId) async {
    await guardApiCall(() => _api.hotlineDeclineOffer(id: requestId));
  }

  @override
  Future<void> endCall(String requestId) async {
    await guardApiCall(() => _api.hotlineEndCall(id: requestId));
  }

  @override
  Future<List<HotlineLineCounter>> counters(List<String> keys) async {
    if (keys.isEmpty) return const [];
    final d = (await guardApiCall(
      () => _api.hotlineCounters(keys: keys.join(',')),
    ))
        .data;
    return [
      for (final c in d.items)
        HotlineLineCounter(key: c.key, lawyers: c.lawyers, clients: c.clients),
    ];
  }

  @override
  Future<void> ackDisclosure(int version) async {
    await guardApiCall(
      () => _api.hotlineDisclosureAck(
        body: api.HotlineDisclosureAckDto(version: version),
      ),
    );
  }
}
