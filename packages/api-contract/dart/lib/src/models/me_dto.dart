// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'me_profile_dto.dart';
import 'missing_requirement.dart';
import 'onboarding_state_dto.dart';
import 'pending_legal_document_dto.dart';
import 'theme_pref.dart';
import 'user_role.dart';
import 'user_status.dart';

part 'me_dto.g.dart';

@JsonSerializable()
class MeDto {
  const MeDto({
    required this.id,
    required this.role,
    required this.status,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.emailVerified,
    required this.phone,
    required this.phoneVerified,
    required this.uiLanguage,
    required this.theme,
    required this.avatarFileId,
    required this.avatarUrl,
    required this.requiredConsentsGranted,
    required this.pendingLegalDocuments,
    required this.onboarding,
    required this.profile,
    required this.missing,
  });

  factory MeDto.fromJson(Map<String, Object?> json) => _$MeDtoFromJson(json);

  final String id;

  /// Null until POST /users/me/role.
  final UserRole? role;
  final UserStatus status;
  final String? firstName;
  final String? lastName;
  final String? email;
  final bool emailVerified;

  /// E.164.
  final String? phone;
  final bool phoneVerified;

  /// ISO 639-1 interface language.
  final String uiLanguage;
  final ThemePref theme;
  final String? avatarFileId;

  /// Short-lived signed link to the avatar (1024 px JPEG).
  final String? avatarUrl;
  final bool requiredConsentsGranted;

  /// Legal documents of my role I have not accepted at the current version (new or materially changed). Empty = nothing to accept. The app shows the acceptance screen; publishing a case and placing a bid answer LEGAL_REACCEPT_REQUIRED meanwhile.
  final List<PendingLegalDocumentDto> pendingLegalDocuments;
  final OnboardingStateDto onboarding;

  /// Null before the profile step is saved (or without a role).
  final MeProfileDto? profile;

  /// What still blocks POST /users/me/onboarding/complete.
  final List<MissingRequirement> missing;

  Map<String, Object?> toJson() => _$MeDtoToJson(this);
}
