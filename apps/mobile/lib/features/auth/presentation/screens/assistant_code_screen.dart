import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/auth/auth_routes.dart';

/// The attorney's one-time code as typed: letters and digits, upper case,
/// a dash after every 4 (XXXX-XXXX-XXXX). The server ignores dashes.
class AssistantCodeFormatter extends TextInputFormatter {
  const AssistantCodeFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final raw = newValue.text.toUpperCase().replaceAll(RegExp('[^0-9A-Z]'), '');
    final clipped = raw.length > 12 ? raw.substring(0, 12) : raw;
    final out = StringBuffer();
    for (var i = 0; i < clipped.length; i++) {
      if (i > 0 && i % 4 == 0) out.write('-');
      out.write(clipped[i]);
    }
    final text = out.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// The code without dashes is complete (12 symbols).
bool isCompleteAssistantCode(String text) =>
    text.replaceAll('-', '').length == 12;

/// `/auth/assistant` (owner 2026-10-04): "I'm an attorney's assistant" —
/// sign in with the one-time code from the attorney, no SMS. On success
/// AppRouterGuard opens the assistant's next step (consents, name), then
/// the attorney's account.
class AssistantCodeScreen extends ConsumerStatefulWidget {
  const AssistantCodeScreen({super.key});

  @override
  ConsumerState<AssistantCodeScreen> createState() =>
      _AssistantCodeScreenState();
}

class _AssistantCodeScreenState extends ConsumerState<AssistantCodeScreen> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!isCompleteAssistantCode(_code.text)) return;
    await ref
        .read(onboardingFlowProvider.notifier)
        .signInWithAssistantCode(_code.text);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final flow = ref.watch(onboardingFlowProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            30,
            AppSpacing.screenSide,
            AppSpacing.xl,
          ),
          children: [
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: AppBackButton(
                semanticLabel: t.t('common.back'),
                onPressed: () => context.canPop()
                    ? context.pop()
                    : context.go(AuthRoutes.welcome),
              ),
            ),
            const SizedBox(height: 34),
            Semantics(
              header: true,
              child: Text(
                t.t('assistant.code.title'),
                style: typography.titleLarge.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('assistant.code.body'),
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: 26),
            AppTextField(
              key: const ValueKey('assistant-code-field'),
              controller: _code,
              label: t.t('assistant.code.field'),
              hintText: 'XXXX-XXXX-XXXX',
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              keyboardType: TextInputType.visiblePassword,
              inputFormatters: const [AssistantCodeFormatter()],
              leading: const AppIcon(AppIcons.supportAgentRounded),
              errorText: flow.errorMessage,
              textInputAction: TextInputAction.go,
              onSubmitted: (_) => _submit(),
              onChanged: (_) {
                ref.read(onboardingFlowProvider.notifier).clearError();
                setState(() {});
              },
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('assistant-code-submit'),
              label: t.t('assistant.code.submit'),
              isLoading: flow.isSubmitting,
              disabledHint: t.t('form.disabled.code'),
              isEnabled: isCompleteAssistantCode(_code.text),
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
