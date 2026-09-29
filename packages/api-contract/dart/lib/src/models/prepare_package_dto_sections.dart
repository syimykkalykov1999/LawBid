// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum PreparePackageDtoSections {
  @JsonValue('profile')
  profile('profile'),
  @JsonValue('contacts')
  contacts('contacts'),
  @JsonValue('cases')
  cases('cases'),
  @JsonValue('bids')
  bids('bids'),
  @JsonValue('contact_disclosures')
  contactDisclosures('contact_disclosures'),
  @JsonValue('messages')
  messages('messages'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const PreparePackageDtoSections(this.json);

  factory PreparePackageDtoSections.fromJson(String json) =>
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
  static List<PreparePackageDtoSections> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
