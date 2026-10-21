// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'forward_status.dart';
import 'forward_target_dto.dart';

part 'forward_result_dto.g.dart';

@JsonSerializable()
class ForwardResultDto {
  const ForwardResultDto({
    required this.target,
    required this.sourceId,
    required this.status,
    this.code,
    this.messageId,
  });

  factory ForwardResultDto.fromJson(Map<String, Object?> json) =>
      _$ForwardResultDtoFromJson(json);

  final ForwardTargetDto target;
  final String sourceId;
  final ForwardStatus status;

  /// failed: the error code of the target (UNSUPPORTED_IN_TARGET, GROUP_FORBIDDEN, CONVERSATION_CLOSED, MESSAGE_REQUEST_DECLINED, FORBIDDEN…).
  final String? code;

  /// sent: the new message (or channel post).
  final String? messageId;

  Map<String, Object?> toJson() => _$ForwardResultDtoToJson(this);
}
