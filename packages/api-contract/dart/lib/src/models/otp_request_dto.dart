// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'otp_request_dto_channel.dart';

part 'otp_request_dto.g.dart';

@JsonSerializable()
class OtpRequestDto {
  const OtpRequestDto({required this.channel, required this.identifier});

  factory OtpRequestDto.fromJson(Map<String, Object?> json) =>
      _$OtpRequestDtoFromJson(json);

  final OtpRequestDtoChannel channel;
  final String identifier;

  Map<String, Object?> toJson() => _$OtpRequestDtoToJson(this);
}
