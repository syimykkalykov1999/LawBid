// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pin_group_message_dto.g.dart';

@JsonSerializable()
class PinGroupMessageDto {
  const PinGroupMessageDto({this.messageId});

  factory PinGroupMessageDto.fromJson(Map<String, Object?> json) =>
      _$PinGroupMessageDtoFromJson(json);

  /// The message to pin; null unpins.
  final String? messageId;

  Map<String, Object?> toJson() => _$PinGroupMessageDtoToJson(this);
}
