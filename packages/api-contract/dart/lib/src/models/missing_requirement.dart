// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// What still blocks POST /users/me/onboarding/complete.
@JsonEnum()
enum MissingRequirement {
  @JsonValue('consents')
  consents('consents'),
  @JsonValue('role')
  role('role'),
  @JsonValue('name')
  name('name'),
  @JsonValue('phone_verified')
  phoneVerified('phone_verified'),
  @JsonValue('email_verified')
  emailVerified('email_verified'),
  @JsonValue('state')
  state('state'),
  @JsonValue('licensed_states')
  licensedStates('licensed_states'),
  @JsonValue('photo')
  photo('photo'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const MissingRequirement(this.json);

  factory MissingRequirement.fromJson(String json) =>
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
  static List<MissingRequirement> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
