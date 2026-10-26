// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_poll_dto.g.dart';

@JsonSerializable()
class CreatePollDto {
  const CreatePollDto({
    required this.clientMessageId,
    required this.question,
    required this.options,
    required this.multiple,
    required this.anonymous,
    this.topicId,
  });

  factory CreatePollDto.fromJson(Map<String, Object?> json) =>
      _$CreatePollDtoFromJson(json);

  /// Client-generated idempotency key.
  final String clientMessageId;

  /// Forum groups: topic.
  final String? topicId;
  final String question;
  final List<String> options;

  /// true = several answers allowed.
  final bool multiple;

  /// true = nobody sees who voted.
  final bool anonymous;

  Map<String, Object?> toJson() => _$CreatePollDtoToJson(this);
}
