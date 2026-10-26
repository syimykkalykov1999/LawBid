// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'push_action_dto_action.dart';

part 'push_action_dto.g.dart';

@JsonSerializable()
class PushActionDto {
  const PushActionDto({
    required this.token,
    required this.fcmToken,
    required this.action,
    this.messageId,
    this.text,
    this.clientMessageId,
  });

  factory PushActionDto.fromJson(Map<String, Object?> json) =>
      _$PushActionDtoFromJson(json);

  /// The signed ticket the chat push carried (data.actionToken).
  final String token;

  /// FCM registration token of this device (still signed in).
  final String fcmToken;
  final PushActionDtoAction action;

  /// «Прочитано»: read up to this message.
  final String? messageId;

  /// «Ответить»: the text.
  final String? text;

  /// App-generated id of the reply (a retry never sends twice).
  final String? clientMessageId;

  Map<String, Object?> toJson() => _$PushActionDtoToJson(this);
}
