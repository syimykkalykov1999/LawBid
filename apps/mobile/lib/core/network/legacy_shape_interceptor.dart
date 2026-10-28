import 'package:dio/dio.dart';

/// Owner 2026-10-28 (app freeze / «Кейсы» empty on an older server): the
/// generated API models REQUIRE fields a server from before them does not
/// send yet (`version` on a case / bid / task / profile, the bid's
/// `bestPrice` / `lowOffer`, …). One missing field made the whole answer
/// unreadable («Unexpected response shape» shown as «no connection»), e.g.
/// the attorney's own profile — and with it the whole «Кейсы» tab, which
/// never even asked for the cases.
///
/// This fills ONLY such missing fields with neutral values (0, false, an
/// empty list), on the routes that return those models, so an app newer
/// than the server keeps working. A server that sends the field is never
/// touched: a key that is present stays as it is. Remove a rule once every
/// server in use sends its field.
class LegacyShapeInterceptor extends Interceptor {
  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    try {
      fixLegacyShape(response.requestOptions.path, response.data);
    } on Object {
      // Never let the fix itself break an answer.
    }
    handler.next(response);
  }
}

/// The path without the API prefix and query (`/api/v1/cases/x?y` →
/// `/cases/x`).
String _route(String path) {
  var p = path;
  final q = p.indexOf('?');
  if (q >= 0) p = p.substring(0, q);
  final uri = Uri.tryParse(p);
  if (uri != null && uri.hasScheme) p = uri.path;
  final v = RegExp(r'^/api/v\d+').firstMatch(p);
  if (v != null) p = p.substring(v.end);
  return p.startsWith('/') ? p : '/$p';
}

bool _under(String route, String prefix) =>
    route == prefix || route.startsWith('$prefix/');

/// Adds the missing new fields in [body] (in place) for a response of
/// [path]. Returns [body].
Object? fixLegacyShape(String path, Object? body) {
  final route = _route(path);
  final version = const [
    '/attorneys/me/profile',
    '/users/me/profile',
    '/users/me/contact-preferences',
    '/users/me/cases',
    '/users/me/bids',
    '/tasks',
    '/cases',
    '/bids',
  ].any((p) => _under(route, p));
  final consultations = _under(route, '/consultations');
  final questions = _under(route, '/questions');
  final promotions = _under(route, '/promotions') ||
      _under(route, '/me/promotions') ||
      RegExp(r'^/(posts|cases)/[^/]+/promotions?$').hasMatch(route);
  if (!version && !consultations && !questions && !promotions) return body;

  void fix(Map<String, dynamic> m) {
    if (version && m.containsKey('id') && !m.containsKey('version')) {
      m['version'] = 0;
    }
    // A bid in a case's list (CaseBidItemDto).
    if (version && m.containsKey('feeType') && m.containsKey('attorney')) {
      m
        ..putIfAbsent('bestPrice', () => false)
        ..putIfAbsent('lowOffer', () => false);
    }
    // ConsultationDto.
    if (consultations &&
        m.containsKey('startsAt') &&
        m.containsKey('viewerRole')) {
      m
        ..putIfAbsent('canMarkNoShow', () => false)
        ..putIfAbsent('noShows', () => <Object?>[]);
    }
    // AnswerDto.
    if (questions && m.containsKey('questionId') && m.containsKey('body')) {
      m.putIfAbsent('verifiedBadge', () => false);
    }
    if (promotions) {
      // CasePromotionDto / MyPromotionDto.
      if (m.containsKey('targetType') && m.containsKey('priceCentsPerDay')) {
        m
          ..putIfAbsent('billing', () => 'impressions')
          ..putIfAbsent('deliveredUnits', () => m['impressions'] ?? 0)
          ..putIfAbsent('actions', () => 0)
          ..putIfAbsent('refundedCents', () => 0);
      }
      // PromotionQuoteDto.
      if (m.containsKey('creditDaysAvailable') &&
          m.containsKey('priceCentsPerDay')) {
        m
          ..putIfAbsent('billing', () => 'impressions')
          ..putIfAbsent('unitPriceCents', () => m['cpmCents'] ?? 0)
          ..putIfAbsent('estUnits', () => m['estImpressions'] ?? 0)
          ..putIfAbsent('offers', () => <Object?>[])
          ..putIfAbsent('actions', () => <Object?>[]);
      }
    }
  }

  void walk(Object? node, {bool top = false}) {
    if (node is Map<String, dynamic>) {
      if (!top) fix(node);
      for (final e in node.entries) {
        // The envelope's `meta` (paging, disclaimers) is never a model.
        if (top && e.key == 'meta') continue;
        walk(e.value);
      }
    } else if (node is List) {
      for (final x in node) {
        walk(x);
      }
    }
  }

  walk(body, top: true);
  return body;
}
