// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'passkey_registration_options_dto.g.dart';

@JsonSerializable()
class PasskeyRegistrationOptionsDto {
  const PasskeyRegistrationOptionsDto({required this.options});

  factory PasskeyRegistrationOptionsDto.fromJson(Map<String, Object?> json) =>
      _$PasskeyRegistrationOptionsDtoFromJson(json);

  /// PublicKeyCredentialCreationOptionsJSON — pass to @simplewebauthn/browser startRegistration() or the native passkey API as is.
  final dynamic options;

  Map<String, Object?> toJson() => _$PasskeyRegistrationOptionsDtoToJson(this);
}
