import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/auth/presentation/screens/email_screen.dart';
import 'package:lawbid/features/auth/presentation/widgets/us_phone_input.dart';
import 'package:lawbid/features/onboarding/application/contact_verification_controller.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/settings/account/application/account_providers.dart';

/// What the flow does with the phone/email.
enum AccountContactMode {
  /// Sets the ACCOUNT contact (users.phone_e164 / users.email): adding a
  /// first one, or replacing a verified one — reauth (code to the current
  /// verified contact, `POST /auth/reauth`) + code on the new contact
  /// (docs/01 §11 3A). Reuses the onboarding ContactVerificationController.
  primary,

  /// Links an ADDITIONAL sign-in phone/email via `POST /auth/identifiers`
  /// (docs/01 §10.3).
  link,
}

/// Settings → Account → change / add / link a phone or email: enter the
/// value → (confirm identity) → code → done. One screen with an internal
/// stage switch, same reasoning as DeleteAccountScreen.
class AccountContactFlowScreen extends ConsumerStatefulWidget {
  const AccountContactFlowScreen({
    required this.type,
    required this.mode,
    super.key,
  });

  final ContactType type;
  final AccountContactMode mode;

  @override
  ConsumerState<AccountContactFlowScreen> createState() =>
      _AccountContactFlowScreenState();
}

class _AccountContactFlowScreenState
    extends ConsumerState<AccountContactFlowScreen> {
  final _controller = TextEditingController();
  String? _localError;

  /// Captured once: after a successful change the reloaded user is
  /// "verified", which must not flip the title mid-flow.
  late final bool _replacing =
      widget.mode == AccountContactMode.primary && _currentlyVerified();

  bool get _isPhone => widget.type == ContactType.phone;

  bool _currentlyVerified() {
    final me = ref.read(currentUserControllerProvider).user;
    return _isPhone
        ? (me?.phoneVerified ?? false)
        : (me?.emailVerified ?? false);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  ContactVerificationState _watch() => widget.mode == AccountContactMode.link
      ? ref.watch(identifierLinkProvider(widget.type))
      : ref.watch(contactVerificationProvider(widget.type));

  Future<void> _sendCode(String value) => widget.mode == AccountContactMode.link
      ? ref.read(identifierLinkProvider(widget.type).notifier).sendCode(value)
      : ref
          .read(contactVerificationProvider(widget.type).notifier)
          .sendCode(value);

  Future<void> _submitCode(ContactVerificationState state, String code) {
    if (widget.mode == AccountContactMode.link) {
      return ref
          .read(identifierLinkProvider(widget.type).notifier)
          .verify(code);
    }
    final notifier =
        ref.read(contactVerificationProvider(widget.type).notifier);
    return state.stage == ContactVerificationStage.confirmIdentity
        ? notifier.confirmIdentity(code)
        : notifier.verify(code);
  }

  Future<void> _resend() => widget.mode == AccountContactMode.link
      ? ref.read(identifierLinkProvider(widget.type).notifier).resend()
      : ref.read(contactVerificationProvider(widget.type).notifier).resend();

  void _edit() => widget.mode == AccountContactMode.link
      ? ref.read(identifierLinkProvider(widget.type).notifier).edit()
      : ref.read(contactVerificationProvider(widget.type).notifier).edit();

  void _send(Translator t) {
    final raw = _controller.text;
    final valid = _isPhone ? UsPhone.isValid(raw) : isPlausibleEmail(raw);
    if (!valid) {
      setState(() => _localError = t.t(
            _isPhone ? 'auth.phone.error.invalid' : 'auth.email.error.invalid',
          ));
      return;
    }
    setState(() => _localError = null);
    unawaited(
        _sendCode(_isPhone ? UsPhone.toE164(raw) : raw.trim().toLowerCase()));
  }

  String _titleKey() {
    final kind = _isPhone ? 'phone' : 'email';
    return switch (widget.mode) {
      AccountContactMode.link => 'account.flow.link.$kind.title',
      AccountContactMode.primary when _replacing =>
        'account.flow.change.$kind.title',
      AccountContactMode.primary => 'account.flow.add.$kind.title',
    };
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final state = _watch();
    final total = _replacing ? 3 : 2;
    final current = switch (state.stage) {
      ContactVerificationStage.editing => 1,
      ContactVerificationStage.confirmIdentity => 2,
      ContactVerificationStage.codeSent => total,
      ContactVerificationStage.verified => null,
    };

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t(_titleKey())),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          child: Column(
            children: [
              if (current != null) ...[
                AppStepProgress(
                  total: total,
                  current: current,
                  semanticLabel: t.t('common.stepOf', {
                    'current': '$current',
                    'total': '$total',
                  }),
                ),
                const SizedBox(height: AppSpacing.xl),
              ],
              Expanded(
                child: AnimatedSwitcher(
                  duration: context.reduceMotion
                      ? Duration.zero
                      : AppMotion.stepSwitch,
                  switchInCurve: AppMotion.enterCurve,
                  switchOutCurve: AppMotion.exitCurve,
                  child: KeyedSubtree(
                    key: ValueKey<ContactVerificationStage>(state.stage),
                    child: _stage(context, t, state),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stage(
      BuildContext context, Translator t, ContactVerificationState state) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final kind = _isPhone ? 'phone' : 'email';
    final error = state.error == null ? null : errorText(t, state.error!);
    String display(String v) => v.startsWith('+') ? UsPhone.format(v) : v;

    switch (state.stage) {
      case ContactVerificationStage.editing:
        return _StageLayout(
          content: [
            const AppIconMedallion(
              icon: Icons.edit_note_rounded,
              size: AppSizes.stateMedallion,
              iconSize: AppSizes.stateIcon,
            ),
            const SizedBox(height: AppSpacing.xl),
            Text(
              t.t('account.flow.enter.$kind'),
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              controller: _controller,
              leading: _isPhone ? const CountryCodeChip() : null,
              hintText: t.t(_isPhone ? 'auth.phone.hint' : 'auth.email.hint'),
              semanticLabel: t.t('account.contact.$kind'),
              errorText: _localError ?? error,
              keyboardType:
                  _isPhone ? TextInputType.phone : TextInputType.emailAddress,
              inputFormatters: _isPhone ? [UsPhoneFormatter()] : null,
              autofillHints: [
                if (_isPhone)
                  AutofillHints.telephoneNumberNational
                else
                  AutofillHints.email,
              ],
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(t),
              onChanged: (_) {
                if (_localError != null) setState(() => _localError = null);
              },
            ),
          ],
          action: AppButton(
            label: t.t('account.flow.sendCode'),
            isLoading: state.busy,
            onPressed: () => _send(t),
          ),
        );
      case ContactVerificationStage.confirmIdentity:
      case ContactVerificationStage.codeSent:
        final confirming =
            state.stage == ContactVerificationStage.confirmIdentity;
        final target =
            confirming ? state.reauthTarget ?? '' : state.value ?? '';
        return _StageLayout(
          content: [
            AppIconMedallion(
              icon: confirming
                  ? Icons.verified_user_outlined
                  : Icons.sms_outlined,
              size: AppSizes.stateMedallion,
              iconSize: AppSizes.stateIcon,
            ),
            const SizedBox(height: AppSpacing.xl),
            Semantics(
              header: true,
              child: Text(
                t.t(confirming
                    ? 'account.flow.identity.title'
                    : 'account.flow.code.title'),
                style: typography.titleLarge.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t(
                confirming
                    ? 'account.flow.identity.body'
                    : 'account.flow.code.body',
                {'target': display(target)},
              ),
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppOtpField(
              key: ValueKey('${state.stage.name}-${state.attempt}'),
              errorText: error,
              onCompleted: (code) => _submitCode(state, code),
            ),
            if (state.busy) ...[
              const SizedBox(height: AppSpacing.sm),
              LinearProgressIndicator(
                minHeight: 2,
                color: colors.gold,
                backgroundColor: colors.border,
              ),
            ],
          ],
          action: Row(
            children: [
              Expanded(
                child: AppButton(
                  label: t.t('auth.otp.resend'),
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  isEnabled: !state.busy,
                  onPressed: state.busy ? null : _resend,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: AppButton(
                  label: t.t('account.flow.editValue'),
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  isEnabled: !state.busy,
                  onPressed: state.busy ? null : _edit,
                ),
              ),
            ],
          ),
        );
      case ContactVerificationStage.verified:
        return _StageLayout(
          content: [
            const AppIconMedallion(
              icon: Icons.check_rounded,
              tone: AppMedallionTone.success,
              size: AppSizes.stateMedallion,
              iconSize: AppSizes.stateIcon,
            ),
            const SizedBox(height: AppSpacing.xl),
            Semantics(
              header: true,
              child: Text(
                t.t('account.flow.done.title'),
                style: typography.titleLarge.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              widget.mode == AccountContactMode.link
                  ? t.t('account.flow.done.linked',
                      {'value': display(state.value ?? '')})
                  : t.t('account.flow.done.$kind'),
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
          ],
          action: AppButton(
            label: t.t('account.flow.done.action'),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        );
    }
  }
}

/// Scrollable content on top (never overflows at 200% text scale), one
/// fixed action at the bottom.
class _StageLayout extends StatelessWidget {
  const _StageLayout({required this.content, required this.action});

  final List<Widget> content;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: staggeredEntrance(content),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        action,
      ],
    );
  }
}
