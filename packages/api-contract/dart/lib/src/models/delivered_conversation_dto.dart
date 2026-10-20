// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'delivered_conversation_dto.g.dart';

@JsonSerializable()
class DeliveredConversationDto {
  const DeliveredConversationDto({required this.lastDeliveredMessageId});

  factory DeliveredConversationDto.fromJson(Map<String, Object?> json) =>
      _$DeliveredConversationDtoFromJson(json);

  final String lastDeliveredMessageId;

  Map<String, Object?> toJson() => _$DeliveredConversationDtoToJson(this);
}
