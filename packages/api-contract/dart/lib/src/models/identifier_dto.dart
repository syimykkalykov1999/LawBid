// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'identifier_type.dart';

part 'identifier_dto.g.dart';

@JsonSerializable()
class IdentifierDto {
  const IdentifierDto({
    required this.id,
    required this.provider,
    required this.value,
    required this.verified,
    required this.isPrimaryContact,
    required this.createdAt,
  });

  factory IdentifierDto.fromJson(Map<String, Object?> json) =>
      _$IdentifierDtoFromJson(json);

  final String id;
  final IdentifierType provider;

  /// Phone (E.164) or email; null for apple/google.
  final String? value;
  final bool verified;

  /// True for the phone/email that is the account's contact.
  final bool isPrimaryContact;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$IdentifierDtoToJson(this);
}
