// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'passkey_dto_device_type.dart';

part 'passkey_dto.g.dart';

@JsonSerializable()
class PasskeyDto {
  const PasskeyDto({
    required this.id,
    required this.name,
    required this.deviceType,
    required this.backedUp,
    required this.transports,
    required this.createdAt,
    required this.lastUsedAt,
  });
  
  factory PasskeyDto.fromJson(Map<String, Object?> json) => _$PasskeyDtoFromJson(json);
  
  final String id;

  /// Label chosen at enrolment (or a default).
  final String name;

  /// multiDevice = a synced passkey (iCloud Keychain, Google Password Manager); singleDevice = a hardware key.
  final PasskeyDtoDeviceType deviceType;

  /// Backed up by the platform (synced).
  final bool backedUp;
  final List<String> transports;
  final DateTime createdAt;
  final DateTime? lastUsedAt;

  Map<String, Object?> toJson() => _$PasskeyDtoToJson(this);
}
