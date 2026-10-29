// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// applied = paid and usable now; requires_action = confirm the payment (3-D Secure) with clientSecret, then GET /subscriptions/me; failed = the card was declined, nothing changed; scheduled = fewer seats from effectiveAt (the period end), no refund.
@JsonEnum()
enum SeatChangeResult {
  @JsonValue('applied')
  applied('applied'),
  @JsonValue('requires_action')
  requiresAction('requires_action'),
  @JsonValue('failed')
  failed('failed'),
  @JsonValue('scheduled')
  scheduled('scheduled'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SeatChangeResult(this.json);

  factory SeatChangeResult.fromJson(String json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to String. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<SeatChangeResult> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
