// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// «Да, нужен» / «Жду предложений получше» / «Уже не нужен» (closes the case) / «Сменить на «Не срочно»».
@JsonEnum()
enum StillNeededAnswer {
  @JsonValue('still_needed')
  stillNeeded('still_needed'),
  @JsonValue('wait_better')
  waitBetter('wait_better'),
  @JsonValue('not_needed')
  notNeeded('not_needed'),
  @JsonValue('make_not_urgent')
  makeNotUrgent('make_not_urgent'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const StillNeededAnswer(this.json);

  factory StillNeededAnswer.fromJson(String json) =>
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
  static List<StillNeededAnswer> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
