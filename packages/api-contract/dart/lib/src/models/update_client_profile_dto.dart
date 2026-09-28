// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_client_profile_dto_contact_method.dart';
import 'update_client_profile_dto_languages.dart';

part 'update_client_profile_dto.g.dart';

@JsonSerializable()
class UpdateClientProfileDto {
  const UpdateClientProfileDto({
    this.firstName,
    this.lastName,
    this.stateCode,
    this.languages,
    this.contactMethod,
    this.contactNote,
  });

  factory UpdateClientProfileDto.fromJson(Map<String, Object?> json) =>
      _$UpdateClientProfileDtoFromJson(json);

  final String? firstName;
  final String? lastName;

  /// Client: state of residence (50 + DC).
  final String? stateCode;

  /// Client preferred_languages / attorney languages — ISO 639-1.
  final List<UpdateClientProfileDtoLanguages>? languages;
  final UpdateClientProfileDtoContactMethod? contactMethod;
  final String? contactNote;

  Map<String, Object?> toJson() => _$UpdateClientProfileDtoToJson(this);
}
