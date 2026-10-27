// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// open: the marked person may dispute until disputeUntil; disputed: waits for staff; confirmed: final, counts for reliability; unconfirmed: the system suggested it and nobody confirmed; withdrawn / overturned: does not count.
@JsonEnum()
enum NoShowDtoState {
  @JsonValue('open')
  open('open'),
  @JsonValue('disputed')
  disputed('disputed'),
  @JsonValue('confirmed')
  confirmed('confirmed'),
  @JsonValue('withdrawn')
  withdrawn('withdrawn'),
  @JsonValue('overturned')
  overturned('overturned'),
  @JsonValue('unconfirmed')
  unconfirmed('unconfirmed'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const NoShowDtoState(this.json);

  factory NoShowDtoState.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to String. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<NoShowDtoState> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
