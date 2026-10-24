// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum NotificationTopic {
  @JsonValue('messages')
  messages('messages'),
  @JsonValue('groups')
  groups('groups'),
  @JsonValue('channels')
  channels('channels'),
  @JsonValue('calls')
  calls('calls'),
  @JsonValue('chatMentions')
  chatMentions('chatMentions'),
  @JsonValue('likes')
  likes('likes'),
  @JsonValue('comments')
  comments('comments'),
  @JsonValue('replies')
  replies('replies'),
  @JsonValue('followers')
  followers('followers'),
  @JsonValue('mentions')
  mentions('mentions'),
  @JsonValue('reactions')
  reactions('reactions'),
  @JsonValue('following')
  following('following'),
  @JsonValue('bidNew')
  bidNew('bidNew'),
  @JsonValue('bidDecision')
  bidDecision('bidDecision'),
  @JsonValue('newCases')
  newCases('newCases'),
  @JsonValue('legalQa')
  legalQa('legalQa'),
  @JsonValue('caseMessages')
  caseMessages('caseMessages'),
  @JsonValue('caseDeadlines')
  caseDeadlines('caseDeadlines'),
  @JsonValue('casePayments')
  casePayments('casePayments'),
  @JsonValue('caseUpdates')
  caseUpdates('caseUpdates'),
  @JsonValue('tasks')
  tasks('tasks'),
  @JsonValue('assistants')
  assistants('assistants'),
  @JsonValue('assistantCases')
  assistantCases('assistantCases'),
  @JsonValue('assistantBids')
  assistantBids('assistantBids'),
  @JsonValue('assistantTasks')
  assistantTasks('assistantTasks'),
  @JsonValue('assistantMessages')
  assistantMessages('assistantMessages'),
  @JsonValue('security')
  security('security'),
  @JsonValue('account')
  account('account'),
  @JsonValue('partner')
  partner('partner'),
  @JsonValue('news')
  news('news'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const NotificationTopic(this.json);

  factory NotificationTopic.fromJson(String json) =>
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
  static List<NotificationTopic> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
