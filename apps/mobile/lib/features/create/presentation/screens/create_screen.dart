import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/create_case_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// The "+" full-screen creation flow (file 07 §3.4). Attorneys: "Пост в
/// ленту" (docs/05). Clients (owner 2026-09-30, OQ-038): a choice between
/// a new case (docs/04) and a post — clients publish posts too.
class CreateScreen extends ConsumerStatefulWidget {
  const CreateScreen({super.key});

  @override
  ConsumerState<CreateScreen> createState() => _CreateScreenState();
}

enum _Kind { caseKind, post }

class _CreateScreenState extends ConsumerState<CreateScreen> {
  _Kind? _kind;

  @override
  Widget build(BuildContext context) {
    if (ref.watch(currentUserRoleProvider) != UserRole.client) {
      return const CreatePostScreen();
    }
    return switch (_kind) {
      _Kind.caseKind => const CreateCaseScreen(),
      _Kind.post => const CreatePostScreen(),
      null => _Chooser(onPick: (k) => setState(() => _kind = k)),
    };
  }
}

class _Chooser extends ConsumerWidget {
  const _Chooser({required this.onPick});

  final ValueChanged<_Kind> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;

    Widget option(_Kind kind, IconData icon, String title, String sub) =>
        Semantics(
          button: true,
          label: '$title. $sub',
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => onPick(kind),
            child: Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: colors.goldTint,
                      shape: BoxShape.circle,
                      border: Border.all(color: colors.goldStroke),
                    ),
                    child: Icon(icon, color: colors.goldDark, size: 28),
                  ),
                  const SizedBox(width: AppSpacing.lg),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style:
                                type.titleMedium.copyWith(color: colors.text)),
                        const SizedBox(height: AppSpacing.xs),
                        Text(sub,
                            style: type.bodySmall
                                .copyWith(color: colors.textSecondary)),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded,
                      color: colors.textSecondary),
                ],
              ),
            ),
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const Icon(Icons.close_rounded),
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('create.title')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenSide),
        children: [
          option(_Kind.caseKind, Icons.gavel_rounded, t.t('create.case'),
              t.t('create.case.sub')),
          const SizedBox(height: AppSpacing.md),
          option(_Kind.post, Icons.edit_note_rounded, t.t('create.post'),
              t.t('create.post.sub')),
        ],
      ),
    );
  }
}
