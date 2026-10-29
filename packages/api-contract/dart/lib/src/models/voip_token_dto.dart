// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'voip_token_dto_environment.dart';

part 'voip_token_dto.g.dart';

@JsonSerializable()
class VoipTokenDto {
  const VoipTokenDto({
    required this.token,
    required this.bundleId,
    required this.environment,
  });
  
  factory VoipTokenDto.fromJson(Map<String, Object?> json) => _$VoipTokenDtoFromJson(json);
  
  /// PushKit token, hex.
  final String token;

  /// The app's bundle id (the VoIP topic is it + '.voip').
  final String bundleId;
  final VoipTokenDtoEnvironment environment;

  Map<String, Object?> toJson() => _$VoipTokenDtoToJson(this);
}
