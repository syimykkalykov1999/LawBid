import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/deadlines/domain/deadline_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20 — `/deadlines/*`.
class DeadlinesRepository {
  DeadlinesRepository(Dio dio) : _api = api.DeadlinesClient(dio);

  final api.DeadlinesClient _api;

  /// Federal rules plus [jurisdiction]'s (all federal when null).
  Future<List<DeadlineRule>> rules({String? jurisdiction}) async {
    final r = await guardApiCall(
      () => _api.listDeadlineRules(jurisdiction: jurisdiction),
    );
    return [for (final d in r.data) _rule(d)];
  }

  Future<DeadlineResult> calculate(String ruleCode, String eventDate) async {
    final d = (await guardApiCall(
      () => _api.calculateDeadline(ruleCode: ruleCode, eventDate: eventDate),
    ))
        .data;
    return DeadlineResult(
      rule: _rule(d.rule),
      eventDate: parseDeadlineDate(d.eventDate),
      dueDate: parseDeadlineDate(d.dueDate),
      rawDate: parseDeadlineDate(d.rawDate),
      rolled: d.rolled,
      holidays: [
        for (final h in d.holidays)
          DeadlineHoliday(date: parseDeadlineDate(h.date), names: h.names),
      ],
      warnings: {
        for (final w in d.warnings)
          if (w.json != null) w.json!,
      },
    );
  }

  static DeadlineRule _rule(api.DeadlineRuleDto d) => DeadlineRule(
        code: d.code,
        jurisdiction: d.jurisdiction,
        kind: DeadlineKind.parse(d.kind.json),
        labels: d.labels,
        amount: d.amount,
        unit: d.unit.json ?? 'day',
        dayType: d.dayType.json ?? 'calendar',
        direction: d.direction.json ?? 'after',
        verified: d.verified,
        practiceCode: d.practiceCode,
        citation: d.citation,
        notes: d.notes,
      );
}
