// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_end_reason.dart';

part 'end_call_dto.g.dart';

@JsonSerializable()
class EndCallDto {
  const EndCallDto({this.reason, this.forAll});

  factory EndCallDto.fromJson(Map<String, Object?> json) =>
      _$EndCallDtoFromJson(json);

  /// hangup (default); no_answer = the caller gave up ringing; failed = the connection could not be set up.
  final CallEndReason? reason;

  /// Group call, host only: end the call for everyone (like Telegram "End call for everyone"). Without it a host who hangs up just leaves, the call goes on for the others.
  final bool? forAll;

  Map<String, Object?> toJson() => _$EndCallDtoToJson(this);
}
