// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/activate_integration_dto.dart';
import '../models/create_integration_version_dto.dart';
import '../models/integration_version_envelope.dart';
import '../models/integration_version_list_envelope.dart';
import '../models/integrations_overview_envelope.dart';
import '../models/remove_integration_dto.dart';

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
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop using the keys saved here (back to the server env)
  @DELETE('/admin/integrations/{provider}')
  Future<void> removeIntegration({
    @Path('provider') required String provider,
    @Body() required RemoveIntegrationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Re-encrypt every key under the active master key
  @POST('/admin/integrations/reencrypt')
  Future<void> reencryptIntegrations({@Extras() Map<String, dynamic>? extras});
}
