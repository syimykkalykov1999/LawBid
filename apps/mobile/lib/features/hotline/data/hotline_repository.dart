import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The client side of `/hotline` (owner row 87, plan step 5). Throws
/// [ApiException]. GETs go through the app's HTTP cache (ETag / 304).
abstract interface class HotlineRepository {
  Future<HotlineConfig> config();
  Future<HotlineRequest> create(HotlineDraft draft);
  Future<HotlineRequest> get(String id);
  Future<HotlineRequest> cancel(String id);
  Future<HotlineRequest> changeLanguages(String id, List<String> languages);
  Future<HotlineRequest> notifyMe(String id, {String? timeZone});
  Future<HotlineRequest> claim(String id, {String? token});
  Future<List<HotlineCounter>> counters(List<String> keys);
  Future<void> ackDisclosure(int version);
  Future<bool> review(String requestId, {required int stars, String? comment});

  /// «Предложить дело» (mockup c11b): our case made from the call, offered
  /// to its attorney; the new case id.
  Future<String> offerCase(String requestId);
}

class ApiHotlineRepository implements HotlineRepository {
  ApiHotlineRepository(Dio dio)
      : _dio = dio,
        _api = api.HotlineClient(dio);

  final Dio _dio;
  final api.HotlineClient _api;

  /// The `{data: …}` body of a POST the generated client does not have yet
  /// (the attorney / server PR adds `review` and `offer-case`, plan doc
  /// «API contract»); an older server answers 404 → [ApiException].
  Future<Map<String, Object?>> _post(String path, Map<String, Object?> body) =>
      guardApiCall(() async {
        final r = await _dio.post<Object?>(path, data: body);
        final d = r.data;
        final inner = d is Map ? d['data'] : null;
        return inner is Map
            ? Map<String, Object?>.from(inner)
            : const <String, Object?>{};
      });

  static HotlineDisclosure? _disclosure(api.HotlineDisclosureDto? d) =>
      d == null || d.key == null || d.kind == null
          ? null
          : HotlineDisclosure(
              full: d.kind == api.HotlineDisclosureKind.full,
              version: d.version.toInt(),
            );

  static HotlineMode _mode(Object? raw) => hotlineModeOf(
        raw is Map ? raw['mode'] as String? : null,
      );

  static HotlineRequest requestOf(api.HotlineRequestViewDto d) =>
      HotlineRequest(
        id: d.id,
        status: HotlineStatus.of(d.status.json),
        positionBand: d.positionBand,
        waitBand: d.waitBand,
        endReason: d.endReason,
        lawyer: d.lawyer == null
            ? null
            : HotlineLawyer(
                id: d.lawyer!.id,
                name: d.lawyer!.name,
                state: d.lawyer!.state,
                barNumber: d.lawyer!.barNumber,
              ),
        notifyUntil: d.notifyUntil == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch(d.notifyUntil!.toInt()),
        disclosure: _disclosure(d.disclosure),
        callId: d.callId,
        conversationId: d.conversationId,
      );

  @override
  Future<HotlineConfig> config() async {
    final d = (await guardApiCall(_api.hotlineConfig)).data;
    return HotlineConfig(
      enabled: d.enabled,
      mode: _mode(d.toJson()),
      maxLanguages: d.maxLanguages.toInt(),
      topicMaxChars: d.topicMaxChars.toInt(),
      countersIntervalSec: d.countersIntervalSec.toInt(),
      notifyClaimSec: d.notifyClaimSec.toInt(),
      reviewEnabled: d.reviewEnabled,
      disclosure: _disclosure(d.disclosure),
    );
  }

  @override
  Future<HotlineRequest> create(HotlineDraft draft) async => requestOf(
        (await guardApiCall(
          () => _api.hotlineCreateRequest(
            body: api.HotlineRequestDto(
              state: draft.state,
              practiceArea: draft.practice,
              languages: draft.languages,
              topic: draft.topic.trim(),
            ),
          ),
        ))
            .data,
      );

  @override
  Future<HotlineRequest> get(String id) async => requestOf(
        (await guardApiCall(() => _api.hotlineGetRequest(id: id))).data,
      );

  @override
  Future<HotlineRequest> cancel(String id) async => requestOf(
        (await guardApiCall(() => _api.hotlineCancelRequest(id: id))).data,
      );

  @override
  Future<HotlineRequest> changeLanguages(
    String id,
    List<String> languages,
  ) async =>
      requestOf(
        (await guardApiCall(
          () => _api.hotlineChangeLanguages(
            id: id,
            body: api.HotlineLanguagesDto(languages: languages),
          ),
        ))
            .data,
      );

  @override
  Future<HotlineRequest> notifyMe(String id, {String? timeZone}) async =>
      requestOf(
        (await guardApiCall(
          () => _api.hotlineNotifyMe(
            id: id,
            body: api.HotlineNotifyMeDto(timeZone: timeZone),
          ),
        ))
            .data,
      );

  @override
  Future<HotlineRequest> claim(String id, {String? token}) async => requestOf(
        (await guardApiCall(
          () => _api.hotlineClaim(
            id: id,
            body: api.HotlineClaimDto(token: token),
          ),
        ))
            .data,
      );

  @override
  Future<List<HotlineCounter>> counters(List<String> keys) async {
    if (keys.isEmpty) return const [];
    final d = (await guardApiCall(
      () => _api.hotlineCounters(keys: keys.take(20).join(',')),
    ))
        .data;
    return [
      for (final i in d.items)
        HotlineCounter(key: i.key, lawyers: i.lawyers, clients: i.clients),
    ];
  }

  @override
  Future<void> ackDisclosure(int version) => guardApiCall(
        () => _api.hotlineDisclosureAck(
          body: api.HotlineDisclosureAckDto(version: version),
        ),
      );

  @override
  Future<bool> review(
    String requestId, {
    required int stars,
    String? comment,
  }) async {
    final text = comment?.trim() ?? '';
    final d = await _post('/hotline/requests/$requestId/review', {
      'stars': stars,
      if (text.isNotEmpty) 'comment': text,
    });
    return d['ok'] == true;
  }

  @override
  Future<String> offerCase(String requestId) async {
    final d = await _post('/hotline/requests/$requestId/offer-case', {});
    final id = d['caseId'];
    if (id is! String) {
      throw const ApiException(
        code: ApiErrorCodes.notFound,
        message: 'no case',
      );
    }
    return id;
  }
}

final hotlineRepositoryProvider = Provider<HotlineRepository>(
  (ref) => ApiHotlineRepository(ref.watch(dioProvider)),
);
