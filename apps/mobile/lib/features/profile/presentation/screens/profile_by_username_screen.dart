import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_public_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart'
    show AttorneyProfileSkeleton;
import 'package:lawbid/features/profile/presentation/widgets/profile_handle_bar.dart';

/// `/u/:username` (owner 2026-10-20) — the address inside a profile QR
/// code. A username belongs to an attorney or to a client; this opens the
/// right profile: the attorney's if there is one, else the client's (which
/// shows its own "unavailable" state when the name is nobody's).
class ProfileByUsernameScreen extends ConsumerWidget {
  const ProfileByUsernameScreen({required this.username, super.key});

  final String username;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final attorney = ref.watch(publicAttorneyProfileProvider(username));
    final isClient = attorney.hasError &&
        attorney.error is ApiException &&
        (attorney.error! as ApiException).code == ApiErrorCodes.notFound;
    if (isClient) return ClientPublicProfileScreen(username: username);
    if (attorney.isLoading && !attorney.hasValue) {
      final colors = Theme.of(context).extension<AppColorTokens>()!;
      return Scaffold(
        backgroundColor: colors.bg,
        appBar: ProfileHandleBar(handle: username),
        body: const AttorneyProfileSkeleton(),
      );
    }
    return AttorneyProfileScreen(username: username);
  }
}
