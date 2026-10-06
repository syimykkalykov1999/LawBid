// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/activate_integration_dto.dart';
import '../models/create_custom_integration_dto.dart';
import '../models/create_integration_version_dto.dart';
import '../models/custom_integration_created_envelope.dart';
import '../models/integration_reveal_envelope.dart';
import '../models/integration_version_envelope.dart';
import '../models/integration_version_list_envelope.dart';
import '../models/integrations_overview_envelope.dart';
import '../models/remove_integration_dto.dart';
import '../models/reorder_integration_slots_dto.dart';
import '../models/slot_body_dto.dart';
import '../models/update_integration_slot_dto.dart';

part 'admin_integrations_client.g.dart';

@RestApi()
abstract class AdminIntegrationsClient {
  factory AdminIntegrationsClient(Dio dio, {String? baseUrl}) =
      _AdminIntegrationsClient;

  /// Every integration: source, masked keys, tests
  @GET('/admin/integrations')
  Future<IntegrationsOverviewEnvelope> listIntegrations({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Versions of one integration (masked)
  @GET('/admin/integrations/{provider}/versions')
  Future<IntegrationVersionListEnvelope> listIntegrationVersions({
    @Path('provider') required String provider,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save new keys as a pending version (needs step-up)
  @POST('/admin/integrations/{provider}/versions')
  Future<IntegrationVersionEnvelope> createIntegrationVersion({
    @Path('provider') required String provider,
    @Body() required CreateIntegrationVersionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Show the saved values of this version in full
  @POST('/admin/integrations/{provider}/versions/{version}/reveal')
  Future<IntegrationRevealEnvelope> revealIntegrationVersion({
    @Path('provider') required String provider,
    @Path('version') required num version,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Test connection with this version
  @POST('/admin/integrations/{provider}/versions/{version}/test')
  Future<IntegrationVersionEnvelope> testIntegrationVersion({
    @Path('provider') required String provider,
    @Path('version') required num version,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Make this version live (needs step-up)
  @POST('/admin/integrations/{provider}/versions/{version}/activate')
  Future<IntegrationVersionEnvelope> activateIntegrationVersion({
    @Path('provider') required String provider,
    @Path('version') required num version,
    @Body() required ActivateIntegrationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Back to the previous version (needs step-up)
  @POST('/admin/integrations/{provider}/rollback')
  Future<IntegrationVersionEnvelope> rollbackIntegration({
    @Path('provider') required String provider,
    @Body() SlotBodyDto? body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop using the keys saved here (back to the server env)
  @DELETE('/admin/integrations/{provider}')
  Future<void> removeIntegration({
    @Path('provider') required String provider,
    @Body() required RemoveIntegrationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner 2026-10-05: rename or switch a key set on/off (needs step-up)
  @PATCH('/admin/integrations/{provider}/slots/{slot}')
  Future<void> updateIntegrationSlot({
    @Path('provider') required String provider,
    @Path('slot') required String slot,
    @Body() required UpdateIntegrationSlotDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner 2026-10-05: the order the API tries the key sets in (needs step-up)
  @PUT('/admin/integrations/{provider}/order')
  Future<void> reorderIntegrationSlots({
    @Path('provider') required String provider,
    @Body() required ReorderIntegrationSlotsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner 2026-10-05: add a service with its own key fields, no code change (needs step-up)
  @POST('/admin/integrations/custom')
  Future<CustomIntegrationCreatedEnvelope> createCustomIntegration({
    @Body() required CreateCustomIntegrationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner 2026-10-05: delete a service added from the admin
  @DELETE('/admin/integrations/custom/{provider}')
  Future<void> deleteCustomIntegration({
    @Path('provider') required String provider,
    @Body() required RemoveIntegrationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Re-encrypt every key under the active master key
  @POST('/admin/integrations/reencrypt')
  Future<void> reencryptIntegrations({@Extras() Map<String, dynamic>? extras});
}
