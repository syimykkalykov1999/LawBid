// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'passkey_assert_dto.g.dart';

@JsonSerializable()
class PasskeyAssertDto {
  const PasskeyAssertDto({
    required this.challengeId,
    required this.response,
  });
  
  factory PasskeyAssertDto.fromJson(Map<String, Object?> json) => _$PasskeyAssertDtoFromJson(json);
  
  final String challengeId;

  /// AuthenticationResponseJSON from the authenticator.
  final dynamic response;

  Map<String, Object?> toJson() => _$PasskeyAssertDtoToJson(this);
}
