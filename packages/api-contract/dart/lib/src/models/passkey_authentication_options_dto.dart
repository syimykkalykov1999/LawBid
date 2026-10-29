// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'passkey_authentication_options_dto.g.dart';

@JsonSerializable()
class PasskeyAuthenticationOptionsDto {
  const PasskeyAuthenticationOptionsDto({
    required this.challengeId,
    required this.options,
  });
  
  factory PasskeyAuthenticationOptionsDto.fromJson(Map<String, Object?> json) => _$PasskeyAuthenticationOptionsDtoFromJson(json);
  
  /// Send it back with the assertion (single use, 5 minutes).
  final String challengeId;

  /// PublicKeyCredentialRequestOptionsJSON — pass to startAuthentication() or the native passkey API as is.
  final dynamic options;

  Map<String, Object?> toJson() => _$PasskeyAuthenticationOptionsDtoToJson(this);
}
