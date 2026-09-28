// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_contact_preferences_dto_contact_method.dart';

part 'update_contact_preferences_dto.g.dart';

@JsonSerializable()
class UpdateContactPreferencesDto {
  const UpdateContactPreferencesDto({this.contactMethod, this.contactNote});

  factory UpdateContactPreferencesDto.fromJson(Map<String, Object?> json) =>
      _$UpdateContactPreferencesDtoFromJson(json);

  final UpdateContactPreferencesDtoContactMethod? contactMethod;
  final String? contactNote;

  Map<String, Object?> toJson() => _$UpdateContactPreferencesDtoToJson(this);
}
