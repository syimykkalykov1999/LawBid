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
import 'package:lawbid/features/onboarding/domain/contact_type.dart';

/// How a contact is required for the current role (docs/01_FOUNDATION_AUTH
/// .md §11: client → phone AND email; attorney → phone, email recommended).
enum ContactRequirement { required, recommended }

/// One contact on the onboarding contacts step, verified INLINE (no extra
/// screens): enter value → confirm identity code → new-contact code → ✔.
/// See ContactVerificationController for why the identity hop exists.
class ContactVerificationCard extends ConsumerStatefulWidget {
  const ContactVerificationCard({
    required this.type,
    required this.requirement,
    required this.verifiedValue,
    super.key,
    this.highlightMissing = false,
    this.initialValue,
  });

  final ContactType type;
  final ContactRequirement requirement;

  /// Non-null when `GET /users/me` already reports this contact verified.
  final String? verifiedValue;

  /// Pre-fill (e.g. an unverified email from social sign-in).
  final String? initialValue;

  /// Continue was tapped while this required contact is unverified.
  final bool highlightMissing;

  @override
  ConsumerState<ContactVerificationCard> createState() => _ContactVerificationCardState();
}

class _ContactVerificationCardState extends ConsumerState<ContactVerificationCard> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.type == ContactType.phone && widget.initialValue != null
        ? UsPhone.format(widget.initialValue!)
        : widget.initialValue,
  );
  String? _localError;

  bool get _isPhone => widget.type == ContactType.phone;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send(Translator t) {
    final raw = _controller.text;
    final valid = _isPhone ? UsPhone.isValid(raw) : isPlausibleEmail(raw);
    if (!valid) {
      setState(() => _localError = t.t(_isPhone ? 'auth.phone.error.invalid' : 'auth.email.error.invalid'));
      return;
    }
    setState(() => _localError = null);
    final value = _isPhone ? UsPhone.toE164(raw) : raw.trim().toLowerCase();
    unawaited(ref.read(contactVerificationProvider(widget.type).notifier).sendCode(value));
  }

  String _display(String value) => _isPhone ? UsPhone.format(value) : value;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final state = ref.watch(contactVerificationProvider(widget.type));
    final notifier = ref.read(contactVerificationProvider(widget.type).notifier);
    final verified = widget.verifiedValue != null;
    final kind = _isPhone ? 'phone' : 'email';
    final errorMessage = state.error == null ? null : errorText(t, state.error!);

    final Widget status;
    if (verified) {
      status = _StatusPill(
        label: t.t('onboarding.contacts.status.verified'),
        color: colors.success,
        background: colors.successTint,
        icon: Icons.verified_rounded,
      );
    } else if (widget.requirement == ContactRequirement.required) {
      status = _StatusPill(
        label: t.t('onboarding.contacts.status.required'),
        color: widget.highlightMissing ? colors.danger : colors.goldDark,
        background: widget.highlightMissing ? colors.dangerTint : colors.goldTint,
      );
    } else {
      status = _StatusPill(
        label: t.t('onboarding.contacts.status.recommended'),
        color: colors.textSecondary,
        background: colors.border.withValues(alpha: 0.5),
      );
    }

    final List<Widget> body;
    if (verified) {
      body = [
        Text(
          _display(widget.verifiedValue!),
          style: typography.body.copyWith(color: colors.text),
        ),
      ];
    } else {
      switch (state.stage) {
        case ContactVerificationStage.editing:
          body = [
            AppTextField(
              controller: _controller,
              leading: _isPhone ? const CountryCodeChip() : null,
              hintText: t.t(_isPhone ? 'auth.phone.hint' : 'auth.email.hint'),
              semanticLabel: t.t('onboarding.contacts.$kind.title'),
              errorText: _localError ?? errorMessage,
              keyboardType: _isPhone ? TextInputType.phone : TextInputType.emailAddress,
              inputFormatters: _isPhone ? [UsPhoneFormatter()] : null,
              autofillHints: [if (_isPhone) AutofillHints.telephoneNumberNational else AutofillHints.email],
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(t),
              onChanged: (_) {
                if (_localError != null) setState(() => _localError = null);
              },
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('onboarding.contacts.sendCode'),
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              isLoading: state.busy,
              onPressed: () => _send(t),
            ),
          ];
        case ContactVerificationStage.confirmIdentity:
        case ContactVerificationStage.codeSent:
          final confirming = state.stage == ContactVerificationStage.confirmIdentity;
          final target = confirming ? state.reauthTarget ?? '' : state.value ?? '';
          body = [
            Text(
              confirming
                  ? t.t('onboarding.contacts.confirmIdentity', {'target': _maybeFormat(target)})
                  : t.t('onboarding.contacts.codeSent', {'target': _display(target)}),
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppOtpField(
              key: ValueKey('${widget.type.name}-${state.attempt}'),
              errorText: errorMessage,
              onCompleted: (code) => confirming ? notifier.confirmIdentity(code) : notifier.verify(code),
            ),
            if (state.busy) ...[
              const SizedBox(height: AppSpacing.sm),
              LinearProgressIndicator(minHeight: 2, color: colors.gold, backgroundColor: colors.border),
            ],
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.lg,
              children: [
                _TextLink(label: t.t('auth.otp.resend'), onTap: state.busy ? null : notifier.resend),
                _TextLink(label: t.t('onboarding.contacts.change'), onTap: state.busy ? null : notifier.edit),
              ],
            ),
          ];
        case ContactVerificationStage.verified:
          body = [
            Text(_display(state.value ?? ''), style: typography.body.copyWith(color: colors.text)),
          ];
      }
    }

    return AnimatedContainer(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(
          color: widget.highlightMissing && !verified
              ? colors.danger
              : (verified ? colors.success.withValues(alpha: 0.5) : colors.border),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIconMedallion(
                icon: _isPhone ? Icons.phone_iphone_rounded : Icons.alternate_email_rounded,
                tone: verified ? AppMedallionTone.success : AppMedallionTone.gold,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    t.t('onboarding.contacts.$kind.title'),
                    style: typography.roleTitle.copyWith(color: colors.text),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              status,
            ],
          ),
          if (!verified && state.stage == ContactVerificationStage.editing) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('onboarding.contacts.$kind.why'),
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          AnimatedSize(
            duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            curve: AppMotion.enterCurve,
            alignment: Alignment.topCenter,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: body),
          ),
        ],
      ),
    );
  }

  String _maybeFormat(String identifier) =>
      identifier.startsWith('+') ? UsPhone.format(identifier) : identifier;
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color, required this.background, this.icon});

  final String label;
  final Color color;
  final Color background;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(AppRadii.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: AppSpacing.lg, color: color),
            const SizedBox(width: AppSpacing.xs),
          ],
          Text(label, style: typography.caption.copyWith(color: color)),
        ],
      ),
    );
  }
}

class _TextLink extends StatelessWidget {
  const _TextLink({required this.label, required this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      child: ExcludeSemantics(
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
            child: Align(
              widthFactor: 1,
              child: Text(
                label,
                style: typography.caption.copyWith(
                  color: onTap == null ? colors.textSecondary : colors.gold,
                  decoration: TextDecoration.underline,
                  decorationColor: colors.gold,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
