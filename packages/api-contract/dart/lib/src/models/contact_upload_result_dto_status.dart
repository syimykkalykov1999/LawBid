// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Hash-checked sync only (absent for `{hashes}`). not_modified: the book and the people list are as the app has them, nothing was done. resync: the server does not have the book `baseHash` names: send it whole (`full`).
@JsonEnum()
enum ContactUploadResultDtoStatus {
  @JsonValue('ok')
  ok('ok'),
  @JsonValue('not_modified')
  notModified('not_modified'),
  @JsonValue('resync')
  resync('resync'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ContactUploadResultDtoStatus(this.json);

  factory ContactUploadResultDtoStatus.fromJson(String json) =>
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
  static List<ContactUploadResultDtoStatus> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
