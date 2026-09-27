import 'package:flutter/foundation.dart';

/// Structured payload of the onboarding profile step (docs/01 §11 3A/3B),
/// sent as `profile` of `PATCH /users/me/onboarding` and persisted by the
/// server into client_profiles / attorney_profiles in one transaction with
/// the names and the step position (apps/api `OnboardingProfileDto`).
@immutable
sealed class ProfileInput {
  const ProfileInput({required this.firstName, required this.lastName});

  final String firstName;
  final String lastName;

  Map<String, dynamic> toJson();
}

/// §11 3A: state of residence, preferred languages, optional contact
/// method + convenient time (note ≤200).
final class ClientProfileInput extends ProfileInput {
  const ClientProfileInput({
    required super.firstName,
    required super.lastName,
    required this.stateCode,
    this.languages = const [],
    this.contactMethod,
    this.contactNote = '',
  });

  final String stateCode;
  final List<String> languages;

  /// Wire value (`call` / `sms` / `email` / `in_app_chat`); null = none.
  final String? contactMethod;
  final String contactNote;

  @override
  Map<String, dynamic> toJson() => {
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'stateCode': stateCode,
        'languages': [...languages]..sort(),
        'contactMethod': contactMethod,
        'contactNote': contactNote.trim(),
      };
}

/// §11 3B: bio ≤300, firm (optional), languages, licensed states.
final class AttorneyProfileInput extends ProfileInput {
  const AttorneyProfileInput({
    required super.firstName,
    required super.lastName,
    this.bio = '',
    this.firmName = '',
    this.languages = const [],
    this.licensedStates = const [],
  });

  final String bio;
  final String firmName;
  final List<String> languages;
  final List<String> licensedStates;

  @override
  Map<String, dynamic> toJson() => {
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'bio': bio.trim(),
        'firmName': firmName.trim(),
        'languages': [...languages]..sort(),
        'licensedStates': [...licensedStates]..sort(),
      };
}
