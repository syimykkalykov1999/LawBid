// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_account_dto.dart';

part 'demo_current_dto.g.dart';

@JsonSerializable()
class DemoCurrentDto {
  const DemoCurrentDto({required this.account, required this.bannerText});

  factory DemoCurrentDto.fromJson(Map<String, Object?> json) =>
      _$DemoCurrentDtoFromJson(json);

  final DemoAccountDto account;

  /// The banner text in the user's language.
  final String bannerText;

  Map<String, Object?> toJson() => _$DemoCurrentDtoToJson(this);
}
