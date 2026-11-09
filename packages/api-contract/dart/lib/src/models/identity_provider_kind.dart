// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Owner 2026-11-08: `manual` = upload the ID + selfie for staff (default, as before); `persona` = only while the admin's Persona card has a key, template and webhook secret and is switched on: the app opens Persona's hosted flow (POST /verification/requests/{id}/identity-check) instead.
@JsonEnum()
enum IdentityProviderKind {
  @JsonValue('manual')
  manual('manual'),
  @JsonValue('persona')
  persona('persona'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const IdentityProviderKind(this.json);

  factory IdentityProviderKind.fromJson(String json) =>
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
  static List<IdentityProviderKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
