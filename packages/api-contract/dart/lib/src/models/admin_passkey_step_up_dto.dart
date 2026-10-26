// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_passkey_step_up_dto.g.dart';

@JsonSerializable()
class AdminPasskeyStepUpDto {
  const AdminPasskeyStepUpDto({
    required this.challengeId,
    required this.response,
  });

  factory AdminPasskeyStepUpDto.fromJson(Map<String, Object?> json) =>
      _$AdminPasskeyStepUpDtoFromJson(json);

  /// challengeId from /step-up/passkey/options.
  final String challengeId;

  /// AuthenticationResponseJSON from the authenticator.
  final dynamic response;

  Map<String, Object?> toJson() => _$AdminPasskeyStepUpDtoToJson(this);
}
