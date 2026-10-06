// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_goal_dto.dart';

part 'update_country_partner_dto.g.dart';

@JsonSerializable()
class UpdateCountryPartnerDto {
  const UpdateCountryPartnerDto({
    this.name,
    this.contact,
    this.maxAdmins,
    this.contractStartsAt,
    this.contractEndsAt,
    this.goals,
    this.note,
  });

  factory UpdateCountryPartnerDto.fromJson(Map<String, Object?> json) =>
      _$UpdateCountryPartnerDtoFromJson(json);

  final String? name;
  final String? contact;
  final int? maxAdmins;
  final DateTime? contractStartsAt;
  final DateTime? contractEndsAt;
  final List<CountryPartnerGoalDto>? goals;
  final String? note;

  Map<String, Object?> toJson() => _$UpdateCountryPartnerDtoToJson(this);
}
