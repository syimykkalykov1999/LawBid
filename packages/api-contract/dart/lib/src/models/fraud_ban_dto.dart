// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'fraud_ban_dto.g.dart';

@JsonSerializable()
class FraudBanDto {
  const FraudBanDto({required this.note, this.includeLinked});

  factory FraudBanDto.fromJson(Map<String, Object?> json) =>
      _$FraudBanDtoFromJson(json);

  final String note;

  /// Also block every account that shares a phone, e-mail, Apple / Google account, card or device with this one.
  final bool? includeLinked;

  Map<String, Object?> toJson() => _$FraudBanDtoToJson(this);
}
