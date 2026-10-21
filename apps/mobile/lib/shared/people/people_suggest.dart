import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart'
    show SearchFilters;
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-21 (inbox 25 / 25b, Instagram): live people suggestions
/// under every «@username / name» field — the call's «Add participant», the
/// group / channel pickers, forward / share, Contacts. One source for all of
/// them: the server's people search (GET /search/people, full-text and
/// trigram over @username and name), so ANY person of the app is found, not
/// only my chats or contacts.

/// The server wants at least two characters (SEARCH_QUERY_TOO_SHORT).
const peopleSuggestMinChars = 2;

/// Waits this long after the last key before asking the server.
const peopleSuggestDebounce = Duration(milliseconds: 250);

/// [raw] as the search text: trimmed, without the leading «@».
String peopleSuggestQuery(String raw) =>
    raw.trim().replaceFirst(RegExp('^@+'), '').trim();

/// One suggested person.
@immutable
class SuggestedPerson {
  const SuggestedPerson({
    required this.id,
    required this.username,
    this.name = '',
    this.avatarUrl,
    this.verified = false,
    this.isAttorney = false,
  });

  factory SuggestedPerson.fromRow(PersonRow row) {
    final a = row.attorney;
    final c = row.client;
    final name = [a?.firstName ?? c?.firstName, a?.lastName ?? c?.lastName]
        .whereType<String>()
        .join(' ')
        .trim();
    return SuggestedPerson(
      id: row.id,
      username: row.username,
      name: name,
      avatarUrl: a?.avatarUrl ?? c?.avatarUrl,
      verified: a?.verified ?? c?.verified ?? false,
      isAttorney: a != null,
    );
  }

  final String id;

  /// Without «@».
  final String username;

  /// First and last name; may be empty.
  final String name;
  final String? avatarUrl;
  final bool verified;
  final bool isAttorney;

  /// The name, or @username when there is none. Never empty.
  String get title => name.isEmpty ? atHandle(username) : name;

  @override
  bool operator ==(Object other) => other is SuggestedPerson && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// Finds people for a (non-empty, normalised) query. Overridden in tests.
typedef PeopleSuggestSearch = Future<List<SuggestedPerson>> Function(
  String query,
);

/// First page of the people search, me left out.
final peopleSuggestSearchProvider = Provider<PeopleSuggestSearch>((ref) {
  final repo = ref.watch(searchRepositoryProvider);
  return (q) async {
    final page = await repo.people(q, const SearchFilters());
    final me = ref.read(currentUserControllerProvider).user?.id;
    return [
      for (final p in page.items)
        if (p.id != me) SuggestedPerson.fromRow(p),
    ];
  };
});

/// Debounced type-ahead over [PeopleSuggestSearch]: a newer query makes the
/// answer of an older one stale (it is dropped, never shown), answers are
/// remembered for the life of the controller (fewer calls against the
/// search rate limit while typing back and forth).
class PeopleSuggestController extends ChangeNotifier {
  PeopleSuggestController(
    this._search, {
    this.debounce = peopleSuggestDebounce,
  });

  final PeopleSuggestSearch _search;
  final Duration debounce;
  final _cache = <String, List<SuggestedPerson>>{};
  Timer? _timer;
  int _seq = 0;
  bool _disposed = false;

  String _query = '';
  List<SuggestedPerson> _results = const [];
  bool _loading = false;
  Object? _error;

  /// The normalised query (no «@»).
  String get query => _query;

  /// The query is long enough to search.
  bool get active => _query.length >= peopleSuggestMinChars;
  List<SuggestedPerson> get results => _results;
  bool get loading => _loading;
  Object? get error => _error;

  void update(String raw) {
    final q = peopleSuggestQuery(raw);
    if (q == _query) return;
    _query = q;
    _timer?.cancel();
    _seq++;
    _error = null;
    if (!active) {
      _results = const [];
      _loading = false;
      notifyListeners();
      return;
    }
    final hit = _cache[q.toLowerCase()];
    if (hit != null) {
      _results = hit;
      _loading = false;
      notifyListeners();
      return;
    }
    // The previous answer stays on screen until the new one comes.
    _loading = true;
    notifyListeners();
    final seq = _seq;
    _timer = Timer(debounce, () => unawaited(_run(q, seq)));
  }

  /// Asks again after an error.
  void retry() {
    final q = _query;
    _query = '';
    update(q);
  }

  Future<void> _run(String q, int seq) async {
    List<SuggestedPerson>? found;
    Object? error;
    try {
      found = await _search(q);
    } on ApiException catch (e) {
      // "a." is two characters here but one after the server's cleanup.
      if (e.code == 'SEARCH_QUERY_TOO_SHORT') {
        found = const [];
      } else {
        error = e;
      }
    } on Object catch (e) {
      error = e;
    }
    if (_disposed || seq != _seq) return;
    _loading = false;
    if (found != null) {
      _cache[q.toLowerCase()] = found;
      _results = found;
      _error = null;
    } else {
      _results = const [];
      _error = error;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
