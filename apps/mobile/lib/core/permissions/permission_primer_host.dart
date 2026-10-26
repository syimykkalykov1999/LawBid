import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/permissions/permission_primer.dart';

/// Owner 2026-10-22 (audit #13): draws [PermissionPrimer]'s explanation —
/// a short card at the bottom over everything (the call screen too), with
/// «Continue» (then the phone's own dialog) and «Not now». It sits in
/// app.dart's builder, so it needs no route and works from a provider.
class PermissionPrimerHost extends ConsumerStatefulWidget {
  const PermissionPrimerHost({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<PermissionPrimerHost> createState() =>
      _PermissionPrimerHostState();
}

class _PermissionPrimerHostState extends ConsumerState<PermissionPrimerHost> {
  late final PermissionPrimer _primer =
      ref.read(permissionPrimerProvider.notifier);

  @override
  void initState() {
    super.initState();
    _primer.attach();
  }

  @override
  void dispose() {
    _primer.detach();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final step = ref.watch(permissionPrimerProvider);
    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        if (step != null)
          PermissionPrimerCard(
            key: ValueKey(step),
            step: step,
            onAnswer: (yes) => _primer.answer(yes: yes),
          ),
      ],
    );
  }
}

/// The explanation card itself (scrim + bottom card).
class PermissionPrimerCard extends ConsumerWidget {
  const PermissionPrimerCard({
    required this.step,
    required this.onAnswer,
    super.key,
  });

  final PrimerStep step;
  final ValueChanged<bool> onAnswer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final mic = step == PrimerStep.microphone;
    final ios = !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;
    final body = mic
        ? [
            t.t('perm.mic.body'),
            if (ios) t.t('perm.mic.lockScreen'),
          ].join(' ')
        : t.t('perm.notif.body');
    return Stack(
      fit: StackFit.expand,
      children: [
        ModalBarrier(
          dismissible: false,
          color: colors.shadow.withValues(alpha: 0.45),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: BlockSemantics(
            child: Semantics(
              scopesRoute: true,
              namesRoute: true,
              explicitChildNodes: true,
              label: t.t(mic ? 'perm.mic.title' : 'perm.notif.title'),
              child: Material(
                key: const ValueKey('permission-primer'),
                color: colors.sheet,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppRadii.sheet),
                ),
                child: SafeArea(
                  top: false,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
                    ),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.xl,
                        AppSpacing.xl,
                        AppSpacing.xl,
                        AppSpacing.md,
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Center(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: colors.goldTint,
                                shape: BoxShape.circle,
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(AppSpacing.md),
                                child: Icon(
                                  mic
                                      ? AppIcons.micRounded
                                      : AppIcons.notificationsActiveOutlined,
                                  color: colors.goldDark,
                                  size: AppSpacing.xxl,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          Text(
                            t.t(mic ? 'perm.mic.title' : 'perm.notif.title'),
                            textAlign: TextAlign.center,
                            style: type.titleMedium.copyWith(
                              color: colors.text,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            body,
                            textAlign: TextAlign.center,
                            style: type.body.copyWith(
                              color: colors.textSecondary,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xl),
                          AppButton(
                            key: const ValueKey('permission-primer-continue'),
                            label: t.t('perm.continue'),
                            onPressed: () => onAnswer(true),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          AppButton(
                            key: const ValueKey('permission-primer-later'),
                            label: t.t('perm.notNow'),
                            variant: AppButtonVariant.secondary,
                            onPressed: () => onAnswer(false),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
