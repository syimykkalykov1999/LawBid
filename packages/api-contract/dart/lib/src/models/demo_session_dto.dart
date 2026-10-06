// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_account_dto.dart';
import 'demo_tokens_dto.dart';

part 'demo_session_dto.g.dart';

@JsonSerializable()
class DemoSessionDto {
  const DemoSessionDto({required this.account, required this.tokens});

  factory DemoSessionDto.fromJson(Map<String, Object?> json) =>
      _$DemoSessionDtoFromJson(json);

  final DemoAccountDto account;
  final DemoTokensDto tokens;

  Map<String, Object?> toJson() => _$DemoSessionDtoToJson(this);
}
