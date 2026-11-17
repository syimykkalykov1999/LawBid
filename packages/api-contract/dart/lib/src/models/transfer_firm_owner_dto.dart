// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'transfer_firm_owner_dto.g.dart';

@JsonSerializable()
class TransferFirmOwnerDto {
  const TransferFirmOwnerDto({required this.attorneyId});

  factory TransferFirmOwnerDto.fromJson(Map<String, Object?> json) =>
      _$TransferFirmOwnerDtoFromJson(json);

  /// An active lawyer of the firm
  final String attorneyId;

  Map<String, Object?> toJson() => _$TransferFirmOwnerDtoToJson(this);
}
