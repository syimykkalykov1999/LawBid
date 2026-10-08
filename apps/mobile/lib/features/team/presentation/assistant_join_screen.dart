import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/application/sign_out.dart';
import 'package:lawbid/features/auth/presentation/screens/assistant_code_screen.dart'
    show AssistantCodeFormatter, isCompleteAssistantCode;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// OQ-048 (owner 2026-09-30): an assistant joins an attorney — at once
/// when the attorney added this phone (older apps), otherwise (owner
/// 2026-10-04) with the one-time code the attorney got for the seat. No
/// SMS anywhere.
class AssistantJoinScreen extends ConsumerStatefulWidget {
  const AssistantJoinScreen({super.key});

  @override
  ConsumerState<AssistantJoinScreen> createState() =>
      _AssistantJoinScreenState();
}

class _AssistantJoinScreenState extends ConsumerState<AssistantJoinScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _run(Future<AssistantMe?> Function() action) async {
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final me = await action();
      if (!mounted) return;
      if (me != null) {
        ref.read(assistantMeProvider.notifier).apply(me);
        if (me.active) {
          // ignore: unawaited_futures
          HapticFeedback.mediumImpact();
          showAppSnackBar(
            context,
            t.t('assistant.join.done', {'name': me.attorneyName ?? ''}),
          );
          context.go(AppRoutes.feed);
          return;
        }
      }
      setState(() => _busy = false);
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = errorText(t, e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(assistantMeProvider).value ?? AssistantMe.none;
    final repo = ref.read(teamRepositoryProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('assistant.join.title')),
        actions: [
          // Capped so a long label leaves room for the title.
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 140),
            child: TextButton(
              onPressed: () => signOut(ref),
              child: Text(
                t.t('assistant.leave'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.xl,
          AppSpacing.screenSide,
          AppSpacing.xxl,
        ),
        children: [
          Center(
            child: Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: colors.goldTint,
                border: Border.all(color: colors.gold),
              ),
              child: AppIcon(
                AppIcons.supportAgentRounded,
                size: 40,
                color: colors.gold,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          // Audit 2026-10-02: the attorney's subscription lapsed.
          if (me.state == AssistantState.paused) ...[
            Text(
              t.t('assistant.paused', {'name': me.attorneyName ?? ''}),
              textAlign: TextAlign.center,
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xl),
          ] else if (me.state == AssistantState.invited) ...[
            Text(
              t.t('assistant.join.invited', {'name': me.attorneyName ?? ''}),
              textAlign: TextAlign.center,
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xl),
            AppButton(
              key: const ValueKey('join-accept'),
              label: t.t('assistant.join.accept'),
              icon: AppIcons.loginRounded,
              isLoading: _busy,
              onPressed: () => _run(repo.acceptInvite),
            ),
            const SizedBox(height: AppSpacing.xl),
            const Divider(),
            const SizedBox(height: AppSpacing.lg),
          ] else ...[
            Text(
              t.t('assistant.join.none'),
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.xl),
          ],
          AppTextField(
            key: const ValueKey('join-code'),
            controller: _code,
            label: t.t('assistant.code.field'),
            hintText: 'XXXX-XXXX-XXXX',
            textCapitalization: TextCapitalization.characters,
            keyboardType: TextInputType.visiblePassword,
            inputFormatters: const [AssistantCodeFormatter()],
            leading: const AppIcon(AppIcons.supportAgentRounded),
            onChanged: (_) => setState(() => _error = null),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            key: const ValueKey('join-verify'),
            label: t.t('assistant.join.verify'),
            isLoading: _busy,
            disabledHint: t.t('form.disabled.code'),
            isEnabled: isCompleteAssistantCode(_code.text),
            onPressed: () => _run(() => repo.joinWithCode(_code.text)),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: typography.bodySmall.copyWith(color: colors.dangerText),
            ),
          ],
        ],
      ),
    );
  }
}
