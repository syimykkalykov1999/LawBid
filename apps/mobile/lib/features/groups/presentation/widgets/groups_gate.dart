import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';

/// Owner 2026-11-16 (row 183): wraps a group screen — with the admin switch
/// «Группы» off the route shows nothing (an empty page with a way back), the
/// same as `ChannelsGate` for channels (channel_widgets.dart).
class GroupsGate extends ConsumerWidget {
  const GroupsGate({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(groupsEnabledProvider)) return child;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    return Scaffold(
      key: const ValueKey('groups-gate'),
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Align(
          alignment: AlignmentDirectional.topStart,
          child: Padding(
            padding: const EdgeInsetsDirectional.only(start: AppSpacing.xs),
            child: AppBackButton(
              semanticLabel: t.t('common.back'),
              onPressed: () => context.safeBack(),
            ),
          ),
        ),
      ),
    );
  }
}
