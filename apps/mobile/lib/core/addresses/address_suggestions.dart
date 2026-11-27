import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-28: what an address field asks the server for.
enum AddressKind {
  /// A street address ("12 Main St, Hays, KS 67601").
  address('address'),

  /// A city only ("Hays, KS"); the field gets the city name.
  city('city'),

  /// Any place, anywhere: a venue, a city or an address, like the
  /// Instagram post location (owner 26.11, «Новая публикация»).
  place('place');

  const AddressKind(this.wire);
  final String wire;

  /// Letters needed before the server is asked (a place: 2, like Instagram).
  int get minChars => this == AddressKind.place ? 2 : kAddressMinChars;
}

/// One line under an address field.
@immutable
class AddressSuggestion {
  const AddressSuggestion({required this.label, this.city, this.stateCode});

  final String label;
  final String? city;
  final String? stateCode;

  /// What goes into the field when the line is tapped.
  String fill(AddressKind kind) =>
      kind == AddressKind.city && (city?.trim().isNotEmpty ?? false)
          ? city!.trim()
          : label;

  @override
  bool operator ==(Object other) =>
      other is AddressSuggestion &&
      other.label == label &&
      other.city == city &&
      other.stateCode == stateCode;

  @override
  int get hashCode => Object.hash(label, city, stateCode);
}

/// The answer: `enabled` false = suggestions are off on the server (switch,
/// no provider key, monthly cap) — the field is plain text. `attribution` is
/// the data credit shown under the lines (e.g. «© OpenStreetMap»), or null.
typedef AddressSuggestions = ({
  bool enabled,
  List<AddressSuggestion> items,
  String? attribution,
});

/// The app waits this long after the last key stroke (owner 2026-10-28:
/// ≥ 250 ms) and needs this many letters before asking the server.
const Duration kAddressDebounce = Duration(milliseconds: 300);
const int kAddressMinChars = 3;

/// Owner 2026-10-28: `GET /addresses/suggest` — the server proxy (the
/// provider key never reaches the phone). Any failure is an empty list: an
/// address field always works as a plain text field.
class AddressSuggestionsRepository {
  AddressSuggestionsRepository(Dio dio) : _client = api.AddressesClient(dio);

  final api.AddressesClient _client;

  Future<AddressSuggestions> suggest(
    String query, {
    AddressKind kind = AddressKind.address,
    String? session,
  }) async {
    final q = query.trim();
    if (q.length < kind.minChars) {
      return (
        enabled: true,
        items: const <AddressSuggestion>[],
        attribution: null,
      );
    }
    try {
      final res = await _client.suggestAddresses(
        q: q,
        kind: kind == AddressKind.address ? null : kind.wire,
        session: session,
      );
      final credit = res.data.attribution?.trim();
      return (
        enabled: res.data.enabled,
        attribution: credit == null || credit.isEmpty ? null : credit,
        items: [
          for (final s in res.data.items)
            if (s.label.trim().isNotEmpty)
              AddressSuggestion(
                label: s.label.trim(),
                city: s.city,
                stateCode: s.stateCode,
              ),
        ],
      );
    } on Object {
      return (
        enabled: true,
        items: const <AddressSuggestion>[],
        attribution: null,
      );
    }
  }
}

final addressSuggestionsRepositoryProvider =
    Provider<AddressSuggestionsRepository>(
  (ref) => AddressSuggestionsRepository(ref.watch(dioProvider)),
);

/// A per-field session id (Google bills one session per typed address).
String newAddressSession([Random? random]) {
  final r = random ?? Random.secure();
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return List.generate(24, (_) => abc[r.nextInt(abc.length)]).join();
}
