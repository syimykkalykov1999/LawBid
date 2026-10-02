import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/application/sign_out.dart';
import 'package:lawbid/features/subscription/presentation/plan_picker.dart'
    show phoneE164;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// OQ-048 (owner 2026-09-30): an assistant joins an attorney — at once
/// when the attorney added this phone (at purchase or in Team), otherwise
/// with a code sent to the attorney's phone that the attorney tells them.
class AssistantJoinScreen extends ConsumerStatefulWidget {
  const AssistantJoinScreen({super.key});

  @override
  ConsumerState<AssistantJoinScreen> createState() =>
      _AssistantJoinScreenState();
}

class _AssistantJoinScreenState extends ConsumerState<AssistantJoinScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
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
          TextButton(
            onPressed: () => signOut(ref),
            child: Text(t.t('assistant.leave')),
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
              child: AppIcon(AppIcons.supportAgentRounded,
                  size: 40, color: colors.gold),
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
          Text(
            t.t('assistant.join.byCode'),
            style: typography.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            key: const ValueKey('join-phone'),
            controller: _phone,
            label: t.t('assistant.join.phone'),
            hintText: '+13125550123',
            keyboardType: TextInputType.phone,
            enabled: !_codeSent,
            leading: const AppIcon(AppIcons.gavelRounded),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[+0-9]')),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          if (!_codeSent)
            AppButton(
              key: const ValueKey('join-send'),
              label: t.t('assistant.join.sendCode'),
              variant: AppButtonVariant.secondary,
              isLoading: _busy,
              onPressed: () {
                final p = _phone.text.trim();
                if (!phoneE164.hasMatch(p)) {
                  setState(() => _error = t.t('plans.phones.invalid'));
                  return;
                }
                _run(() async {
                  await repo.requestJoinCode(p);
                  if (mounted) setState(() => _codeSent = true);
                  return null;
                });
              },
            )
          else ...[
            Text(
              t.t('assistant.join.codeSent'),
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppOtpField(
              key: const ValueKey('join-code'),
              controller: _code,
              semanticLabel: t.t('assistant.join.code'),
              onCompleted: (code) => _run(
                () => repo.verifyJoinCode(_phone.text.trim(), code),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('join-verify'),
              label: t.t('assistant.join.verify'),
              isLoading: _busy,
              onPressed: () => _run(
                () => repo.verifyJoinCode(_phone.text.trim(), _code.text),
              ),
            ),
          ],
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
