// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Identity documents: front/back (back required for drivers_license and state_id).
@JsonEnum()
enum AttachDocumentDtoSide {
  @JsonValue('front')
  front('front'),
  @JsonValue('back')
  back('back'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AttachDocumentDtoSide(this.json);

  factory AttachDocumentDtoSide.fromJson(String json) =>
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
  static List<AttachDocumentDtoSide> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
