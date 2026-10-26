import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart' show SyncedPage;
import 'package:lawbid/features/consultations/domain/consultation_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20 — `/consultations/*`.
class ConsultationsRepository {
  ConsultationsRepository(Dio dio) : _api = api.ConsultationsClient(dio);

  final api.ConsultationsClient _api;

  Future<ConsultationSettings> settings() async =>
      _settings((await guardApiCall(_api.getConsultationSettings)).data);

  Future<ConsultationSettings> saveSettings({
    required bool enabled,
    required int slotMinutes,
    required int bufferMinutes,
    required int minNoticeHours,
    required int horizonDays,
    required bool autoConfirm,
    required String timezone,
    required List<ConsultationWindow> windows,
    required List<ConsultationTimeOff> timeOff,
  }) async =>
      _settings(
        (await guardApiCall(
          () => _api.updateConsultationSettings(
            body: api.UpdateConsultationSettingsDto(
              enabled: enabled,
              slotMinutes: slotMinutes,
              bufferMinutes: bufferMinutes,
              minNoticeHours: minNoticeHours,
              horizonDays: horizonDays,
              autoConfirm: autoConfirm,
              timezone: timezone,
              windows: [
                for (final w in windows)
                  api.ConsultationWindowDto(
                    weekday: w.weekday,
                    startMinute: w.startMinute,
                    endMinute: w.endMinute,
                  ),
              ],
              timeOff: [
                for (final o in timeOff)
                  api.ConsultationTimeOffDto(
                    startsOn: o.startsOn,
                    endsOn: o.endsOn,
                    note: o.note,
                  ),
              ],
            ),
          ),
        ))
            .data,
      );

  /// Free starts of [attorneyId] for [days] days from [from] (attorney's
  /// local `YYYY-MM-DD`; null = today there).
  Future<ConsultationSlots> slots(
    String attorneyId, {
    String? from,
    int days = 14,
  }) async {
    final d = (await guardApiCall(
      () => _api.listConsultationSlots(
        attorneyId: attorneyId,
        from: from,
        days: days,
      ),
    ))
        .data;
    return ConsultationSlots(
      timezone: d.timezone,
      slotMinutes: d.slotMinutes,
      autoConfirm: d.autoConfirm,
      from: d.from,
      lastDate: d.lastDate,
      slots: [
        for (var i = 0; i < d.slots.length && i < d.localSlots.length; i++)
          ConsultationSlot(
            startsAt: DateTime.parse(d.slots[i]).toUtc(),
            local: d.localSlots[i],
          ),
      ],
    );
  }

  Future<CursorPage<Consultation>> list(
    ConsultationView view, {
    String? cursor,
  }) async {
    final r = await guardApiCall(
      () => _api.listConsultations(
        cursor: cursor,
        view: switch (view) {
          ConsultationView.upcoming => api.View.upcoming,
          ConsultationView.pending => api.View.pending,
          ConsultationView.past => api.View.past,
        },
      ),
    );
    return CursorPage(
      items: r.data.map(_consultation).toList(),
      nextCursor: r.meta?.nextCursor,
    );
  }

  /// Package E: only my consultations changed since [since] in [view].
  Future<SyncedPage<Consultation>> listChangedSince(
    ConsultationView view,
    DateTime since,
  ) async {
    final r = await guardApiCall(
      () => _api.listConsultations(
        updatedSince: since.toUtc(),
        view: switch (view) {
          ConsultationView.upcoming => api.View.upcoming,
          ConsultationView.pending => api.View.pending,
          ConsultationView.past => api.View.past,
        },
      ),
    );
    return SyncedPage(
      items: r.data.map(_consultation).toList(),
      deletedIds: r.meta?.deletedIds ?? const [],
      syncedAt: r.meta?.syncedAt,
    );
  }

  Future<Consultation> get(String id) async => _consultation(
        (await guardApiCall(() => _api.getConsultation(id: id))).data,
      );

  Future<Consultation> book({
    required String attorneyId,
    required DateTime startsAt,
    String? note,
    String? caseId,
  }) async =>
      _consultation(
        (await guardApiCall(
          () => _api.bookConsultation(
            body: api.CreateConsultationDto(
              attorneyId: attorneyId,
              startsAt: startsAt.toUtc().toIso8601String(),
              note: (note ?? '').trim().isEmpty ? null : note!.trim(),
              caseId: caseId,
            ),
            extras: _once,
          ),
        ))
            .data,
      );

  Future<Consultation> confirm(String id) async => _consultation(
        (await guardApiCall(
          () => _api.confirmConsultation(id: id, extras: _once),
        ))
            .data,
      );

  Future<Consultation> decline(String id, {String? reason}) async =>
      _consultation(
        (await guardApiCall(
          () => _api.declineConsultation(
            id: id,
            body: api.ConsultationReasonDto(reason: _reason(reason)),
            extras: _once,
          ),
        ))
            .data,
      );

  Future<Consultation> cancel(String id, {String? reason}) async =>
      _consultation(
        (await guardApiCall(
          () => _api.cancelConsultation(
            id: id,
            body: api.ConsultationReasonDto(reason: _reason(reason)),
            extras: _once,
          ),
        ))
            .data,
      );

  Future<Consultation> reschedule(String id, DateTime startsAt) async =>
      _consultation(
        (await guardApiCall(
          () => _api.rescheduleConsultation(
            id: id,
            body: api.RescheduleConsultationDto(
              startsAt: startsAt.toUtc().toIso8601String(),
            ),
            extras: _once,
          ),
        ))
            .data,
      );

  /// Every state-changing POST carries an Idempotency-Key.
  static const Map<String, dynamic> _once = {
    RequestFlags.createsResource: true,
  };

  static String? _reason(String? v) =>
      v == null || v.trim().isEmpty ? null : v.trim();

  static ConsultationSettings _settings(api.ConsultationSettingsDto d) =>
      ConsultationSettings(
        enabled: d.enabled,
        slotMinutes: d.slotMinutes,
        bufferMinutes: d.bufferMinutes,
        minNoticeHours: d.minNoticeHours,
        horizonDays: d.horizonDays,
        autoConfirm: d.autoConfirm,
        timezone: d.timezone,
        windows: [
          for (final w in d.windows)
            ConsultationWindow(
              weekday: w.weekday,
              startMinute: w.startMinute,
              endMinute: w.endMinute,
            ),
        ],
        timeOff: [
          for (final o in d.timeOff)
            ConsultationTimeOff(
              startsOn: o.startsOn,
              endsOn: o.endsOn,
              note: o.note,
            ),
        ],
        bookable: d.bookable,
        notBookableReason: d.notBookableReason?.json,
      );

  static Consultation _consultation(api.ConsultationDto d) => Consultation(
        id: d.id,
        status: ConsultationStatus.parse(d.status.json),
        startsAt: DateTime.parse(d.startsAt).toUtc(),
        endsAt: DateTime.parse(d.endsAt).toUtc(),
        viewerIsAttorney:
            d.viewerRole == api.ConsultationDtoViewerRole.attorney,
        counterpart: ConsultationPerson(
          id: d.counterpart.id,
          displayName: d.counterpart.displayName,
          username: d.counterpart.username,
          avatarUrl: d.counterpart.avatarUrl,
        ),
        attorneyTimezone: d.attorneyTimezone,
        canCall: d.canCall,
        note: d.note,
        caseId: d.caseId,
        conversationId: d.conversationId,
        cancelReason: d.cancelReason,
        cancelledBy: d.cancelledBy?.json,
      );
}
