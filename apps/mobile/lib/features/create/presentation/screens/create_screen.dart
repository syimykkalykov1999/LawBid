import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/cases/presentation/screens/create_case_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// The "+" full-screen creation flow (file 07 §3.4: "Экран открывается как
/// full-screen с крестиком"): "Создать кейс" for clients (docs/04),
/// "Пост в ленту" for attorneys (docs/05).
class CreateScreen extends ConsumerWidget {
  const CreateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // docs/04 §3.1: "+" opens the case wizard for clients; docs/05 §3.1:
    // "Пост в ленту" for attorneys (verification is checked by the router
    // guard and by the server, POST_NOT_ALLOWED).
    if (ref.watch(currentUserRoleProvider) == UserRole.client) {
      return const CreateCaseScreen();
    }
    return const CreatePostScreen();
  }
}
