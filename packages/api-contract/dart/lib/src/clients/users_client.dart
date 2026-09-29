// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/consents_saved_envelope.dart';
import '../models/contact_code_sent_envelope.dart';
import '../models/contact_request_dto.dart';
import '../models/contact_verified_envelope.dart';
import '../models/contact_verify_dto.dart';
import '../models/data_export_job_envelope.dart';
import '../models/deletion_pending_envelope.dart';
import '../models/identifier_list_envelope.dart';
import '../models/me_envelope.dart';
import '../models/save_consents_dto.dart';
import '../models/save_onboarding_step_dto.dart';
import '../models/set_role_dto.dart';
import '../models/update_profile_dto.dart';

part 'users_client.g.dart';

@RestApi()
abstract class UsersClient {
  factory UsersClient(Dio dio, {String? baseUrl}) = _UsersClient;

  /// Queue the user data export ZIP (docs/06 §5.2).
  ///
  /// [xReauthToken] - reauthToken from POST /auth/reauth (5 minutes).
  @POST('/users/me/data-export')
  Future<DataExportJobEnvelope> requestDataExport({
    @Header('X-Reauth-Token') required String xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Export status; a fresh 24-hour signed link while it is ready
  @GET('/users/me/data-export/{exportId}')
  Future<DataExportJobEnvelope> getDataExport({
    @Path('exportId') required String exportId,
    @Extras() Map<String, dynamic>? extras,
  });

  @GET('/users/me')
  Future<MeEnvelope> me({@Extras() Map<String, dynamic>? extras});

  @PATCH('/users/me')
  Future<MeEnvelope> updateProfile({
    @Body() required UpdateProfileDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// [xReauthToken] - Single-use token from POST /auth/reauth (docs/01 §10.7).
  @DELETE('/users/me')
  Future<DeletionPendingEnvelope> deleteAccount({
    @Header('X-Reauth-Token') required String xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  /// docs/01 §10.3: Settings → Account lists the linked sign-in methods.
  /// Linking more goes through POST /auth/identifiers; changing the phone/.
  /// email contact through contacts/request (+ reauth) and contacts/verify.
  @GET('/users/me/identifiers')
  Future<IdentifierListEnvelope> listIdentifiers({
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/users/me/role')
  Future<MeEnvelope> setRole({
    @Body() required SetRoleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @PATCH('/users/me/onboarding')
  Future<MeEnvelope> saveOnboardingStep({
    @Body() required SaveOnboardingStepDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/users/me/onboarding/complete')
  Future<MeEnvelope> completeOnboarding({
    @Extras() Map<String, dynamic>? extras,
  });

  /// docs/01 §11 step 3A: "Изменить телефон/email можно только с повторной.
  /// проверкой (reauth + код на новый контакт)". Adding the FIRST contact of.
  /// a type during onboarding needs no reauth (it would cost an extra paid.
  /// code per contact); replacing an already-verified one does.
  ///
  /// [xReauthToken] - Single-use token from POST /auth/reauth; required only when replacing an already verified contact of this type.
  @POST('/users/me/contacts/request')
  Future<ContactCodeSentEnvelope> requestContact({
    @Body() required ContactRequestDto body,
    @Header('X-Reauth-Token') String? xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/users/me/contacts/verify')
  Future<ContactVerifiedEnvelope> verifyContact({
    @Body() required ContactVerifyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/users/me/consents')
  Future<ConsentsSavedEnvelope> saveConsents({
    @Body() required SaveConsentsDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
