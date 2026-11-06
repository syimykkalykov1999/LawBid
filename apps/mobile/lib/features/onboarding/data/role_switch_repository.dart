import 'package:lawbid/features/onboarding/data/current_user_mapper.dart';
import 'package:lawbid/features/onboarding/data/users_api_client.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/role_switch_preview.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-11-05: Settings → Account «Сменить профиль». Throws
/// `ApiException` (the 409 `ROLE_SWITCH_BLOCKED` carries the blockers).
abstract interface class RoleSwitchRepository {
  Future<RoleSwitchPreview> preview();

  /// [reauthToken]: the single-use token of the password / passkey step.
  Future<CurrentUser> switchTo(UserRole role, String reauthToken);
}

class ApiRoleSwitchRepository implements RoleSwitchRepository {
  ApiRoleSwitchRepository(this._users);

  final UsersApiClient _users;

  @override
  Future<RoleSwitchPreview> preview() async {
    final dto = await _users.previewRoleSwitch();
    return RoleSwitchPreview(
      to: dto.to == api.RoleSwitchPreviewDtoTo.attorney
          ? UserRole.attorney
          : UserRole.client,
      blockers: dto.blockers,
      needsOnboarding: dto.needsOnboarding,
      retryAfterSeconds: dto.retryAfterSeconds,
    );
  }

  @override
  Future<CurrentUser> switchTo(UserRole role, String reauthToken) async =>
      CurrentUserMapper.fromDto(
        await _users.switchRole(
          role == UserRole.attorney
              ? api.SwitchRoleDtoRole.attorney
              : api.SwitchRoleDtoRole.client,
          reauthToken,
        ),
      );
}
