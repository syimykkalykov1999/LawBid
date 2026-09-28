// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_method.dart';
import 'state_ref_dto.dart';

part 'client_profile_dto.g.dart';

@JsonSerializable()
class ClientProfileDto {
  const ClientProfileDto({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.state,
    required this.languages,
    required this.contactMethod,
    required this.contactNote,
  });

  factory ClientProfileDto.fromJson(Map<String, Object?> json) =>
      _$ClientProfileDtoFromJson(json);

  final String id;
  final String? firstName;
  final String? lastName;
  final StateRefDto state;

  /// ISO 639-1 codes.
  final List<String> languages;
  final ContactMethod? contactMethod;
  final String? contactNote;

  Map<String, Object?> toJson() => _$ClientProfileDtoToJson(this);
}
