// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'send_profile_gift_dto.g.dart';

@JsonSerializable()
class SendProfileGiftDto {
  const SendProfileGiftDto({
    required this.recipientId,
    this.note,
    this.anonymous,
  });
  
  factory SendProfileGiftDto.fromJson(Map<String, Object?> json) => _$SendProfileGiftDtoFromJson(json);
  
  final String recipientId;
  final String? note;

  /// Hide who gave it from the receiver.
  final bool? anonymous;

  Map<String, Object?> toJson() => _$SendProfileGiftDtoToJson(this);
}
