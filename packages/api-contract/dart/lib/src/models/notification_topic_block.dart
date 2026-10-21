// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum NotificationTopicBlock {
  @JsonValue('chats')
  chats('chats'),
  @JsonValue('feed')
  feed('feed'),
  @JsonValue('bids')
  bids('bids'),
  @JsonValue('cases')
  cases('cases'),
  @JsonValue('assistants')
  assistants('assistants'),
  @JsonValue('system')
  system('system'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const NotificationTopicBlock(this.json);

  factory NotificationTopicBlock.fromJson(String json) =>
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
  static List<NotificationTopicBlock> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
