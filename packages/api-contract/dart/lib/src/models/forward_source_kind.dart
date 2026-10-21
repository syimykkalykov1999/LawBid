// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// message: a direct / case chat message; group_message; channel_post; group_link / channel_link: a protected group / channel shared as its link (id = the group / channel).
@JsonEnum()
enum ForwardSourceKind {
  @JsonValue('message')
  message('message'),
  @JsonValue('group_message')
  groupMessage('group_message'),
  @JsonValue('channel_post')
  channelPost('channel_post'),
  @JsonValue('group_link')
  groupLink('group_link'),
  @JsonValue('channel_link')
  channelLink('channel_link'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ForwardSourceKind(this.json);

  factory ForwardSourceKind.fromJson(String json) =>
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
  static List<ForwardSourceKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
