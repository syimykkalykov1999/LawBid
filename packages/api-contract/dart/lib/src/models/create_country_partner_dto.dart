// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_goal_dto.dart';

part 'create_country_partner_dto.g.dart';

@JsonSerializable()
class CreateCountryPartnerDto {
  const CreateCountryPartnerDto({
    required this.countryCode,
    required this.name,
    required this.email,
    required this.sharePercent,
    this.contact,
    this.login,
    this.password,
    this.maxAdmins,
    this.contractStartsAt,
    this.contractEndsAt,
    this.goals,
    this.note,
  });

  factory CreateCountryPartnerDto.fromJson(Map<String, Object?> json) =>
      _$CreateCountryPartnerDtoFromJson(json);

  final String countryCode;

  /// Company or person (contract party).
  final String name;
  final String? contact;

  /// The partner's sign-in e-mail (new admin account).
  final String email;

  /// Login for the new account.
  final String? login;

  /// Password for the new account.
  final String? password;

  /// Share of net revenue, percent (0.01–90).
  final num sharePercent;

  /// Staff limit (default 10).
  final int? maxAdmins;
  final DateTime? contractStartsAt;
  final DateTime? contractEndsAt;
  final List<CountryPartnerGoalDto>? goals;
  final String? note;

  Map<String, Object?> toJson() => _$CreateCountryPartnerDtoToJson(this);
}
