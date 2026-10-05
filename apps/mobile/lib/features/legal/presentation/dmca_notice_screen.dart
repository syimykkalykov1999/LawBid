import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/legal/application/legal_providers.dart';
import 'package:lawbid/features/legal/domain/legal_models.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/consent_check_tile.dart';

final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

/// Owner 2026-10-05 (legal) — the DMCA takedown form (17 U.S.C. §512(c)):
/// who complains, which work, where it is (a LawBid target from the
/// report sheet, or a URL), the two sworn statements and a signature.
/// `POST /legal/dmca`.
class DmcaNoticeScreen extends ConsumerStatefulWidget {
  const DmcaNoticeScreen({super.key, this.targetType, this.targetId});

  /// `post` · `comment` · `case_comment` · `message`; null = URL form.
  final String? targetType;
  final String? targetId;

  @override
  ConsumerState<DmcaNoticeScreen> createState() => _DmcaNoticeScreenState();
}

class _DmcaNoticeScreenState extends ConsumerState<DmcaNoticeScreen> {
  static const _workMin = 20;

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _address = TextEditingController();
  final _phone = TextEditingController();
  final _work = TextEditingController();
  final _url = TextEditingController();
  final _signature = TextEditingController();
  bool _goodFaith = false;
  bool _accuracy = false;
  bool _submitted = false;
  bool _sending = false;

  DmcaTarget? get _target {
    final id = widget.targetId;
    if (id == null || id.isEmpty) return null;
    return DmcaTarget.parse(widget.targetType);
  }

  bool get _hasTarget => _target != null;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _address.dispose();
    _phone.dispose();
    _work.dispose();
    _url.dispose();
    _signature.dispose();
    super.dispose();
  }

  // --- validation (messages only after the first submit attempt) ---

  String? _required(Translator t, TextEditingController c, {int min = 2}) {
    final v = c.text.trim();
    if (v.isEmpty) return t.t('dmca.error.required');
    if (v.length < min) return t.t('dmca.error.short', {'min': '$min'});
    return null;
  }

  String? _emailError(Translator t) {
    final v = _email.text.trim();
    if (v.isEmpty) return t.t('dmca.error.required');
    if (!_emailRe.hasMatch(v)) return t.t('dmca.error.email');
    return null;
  }

  String? _urlError(Translator t) {
    if (_hasTarget) return null;
    final v = _url.text.trim();
    if (v.isEmpty) return t.t('dmca.error.required');
    final uri = Uri.tryParse(v);
    if (uri == null || !(uri.isScheme('http') || uri.isScheme('https'))) {
      return t.t('dmca.error.url');
    }
    return null;
  }

  bool _valid(Translator t) =>
      _required(t, _name) == null &&
      _emailError(t) == null &&
      _required(t, _address, min: 5) == null &&
      _required(t, _work, min: _workMin) == null &&
      _urlError(t) == null &&
      _required(t, _signature) == null &&
      _goodFaith &&
      _accuracy;

  Future<void> _submit() async {
    final t = ref.read(translatorProvider);
    setState(() => _submitted = true);
    if (!_valid(t)) {
      if (!_goodFaith || !_accuracy) {
        showAppSnackBar(context, t.t('dmca.error.checks'));
      }
      return;
    }
    setState(() => _sending = true);
    try {
      final phone = _phone.text.trim();
      await ref.read(legalRepositoryProvider).createDmcaNotice(
            DmcaNoticeDraft(
              target: _target,
              targetId: _hasTarget ? widget.targetId : null,
              infringingUrl: _hasTarget ? null : _url.text.trim(),
              complainantName: _name.text.trim(),
              complainantEmail: _email.text.trim(),
              complainantAddress: _address.text.trim(),
              complainantPhone: phone.isEmpty ? null : phone,
              workDescription: _work.text.trim(),
              goodFaith: _goodFaith,
              accuracySworn: _accuracy,
              signature: _signature.text.trim(),
            ),
          );
      if (!mounted) return;
      showAppSnackBar(context, t.t('dmca.sent'));
      if (context.canPop()) {
        context.pop();
      } else {
        await Navigator.of(context).maybePop();
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final agent = ref.watch(legalSettingsProvider).value?.dmcaAgent;
    final e = _submitted;
    final target = _target;

    Widget check({
      required Key key,
      required bool value,
      required ValueChanged<bool> onChanged,
      required String text,
    }) =>
        ConsentCheckTile(
          key: key,
          value: value,
          onChanged: onChanged,
          semanticLabel: text,
          showError: e && !value,
          content: Text(
            text,
            style: type.bodySmall.copyWith(color: colors.text, height: 1.35),
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('dmca.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                children: [
                  _AgentCard(agent: agent, t: t),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    t.t('dmca.intro'),
                    style: type.bodySmall.copyWith(
                      color: colors.textSecondary,
                      height: 1.4,
                    ),
                  ),
                  if (target != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      t.t('dmca.target.${target.wire}'),
                      key: const ValueKey('dmca-target'),
                      style: type.caption.copyWith(color: colors.goldDark),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  AppTextField(
                    key: const ValueKey('dmca-name'),
                    controller: _name,
                    label: t.t('dmca.field.name'),
                    maxLength: 200,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.name],
                    errorText: e ? _required(t, _name) : null,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    key: const ValueKey('dmca-email'),
                    controller: _email,
                    label: t.t('dmca.field.email'),
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    errorText: e ? _emailError(t) : null,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    key: const ValueKey('dmca-address'),
                    controller: _address,
                    label: t.t('dmca.field.address'),
                    maxLines: 3,
                    maxLength: 500,
                    textCapitalization: TextCapitalization.sentences,
                    autofillHints: const [AutofillHints.fullStreetAddress],
                    errorText: e ? _required(t, _address, min: 5) : null,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    key: const ValueKey('dmca-phone'),
                    controller: _phone,
                    label: t.t('dmca.field.phone'),
                    keyboardType: TextInputType.phone,
                    maxLength: 40,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.telephoneNumber],
                  ),
                  if (!_hasTarget) ...[
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      key: const ValueKey('dmca-url'),
                      controller: _url,
                      label: t.t('dmca.field.url'),
                      hintText: t.t('dmca.field.urlHint'),
                      keyboardType: TextInputType.url,
                      maxLength: 1000,
                      textInputAction: TextInputAction.next,
                      errorText: e ? _urlError(t) : null,
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    key: const ValueKey('dmca-work'),
                    controller: _work,
                    label: t.t('dmca.field.work'),
                    hintText: t.t('dmca.field.workHint'),
                    maxLines: 6,
                    maxLength: 4000,
                    textCapitalization: TextCapitalization.sentences,
                    errorText: e ? _required(t, _work, min: _workMin) : null,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  check(
                    key: const ValueKey('dmca-good-faith'),
                    value: _goodFaith,
                    onChanged: (v) => setState(() => _goodFaith = v),
                    text: t.t('dmca.goodFaith'),
                  ),
                  check(
                    key: const ValueKey('dmca-accuracy'),
                    value: _accuracy,
                    onChanged: (v) => setState(() => _accuracy = v),
                    text: t.t('dmca.accuracy'),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    key: const ValueKey('dmca-signature'),
                    controller: _signature,
                    label: t.t('dmca.field.signature'),
                    maxLength: 200,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.done,
                    errorText: e ? _required(t, _signature) : null,
                    onChanged: (_) => setState(() {}),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: AppButton(
                key: const ValueKey('dmca-submit'),
                label: t.t('dmca.submit'),
                icon: AppIcons.sendRounded,
                isLoading: _sending,
                isEnabled: !_sending,
                onPressed: _submit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// «DMCA agent: name, email» or the placeholder while the owner has not
/// registered an agent yet (the settings request may also still be loading).
class _AgentCard extends StatelessWidget {
  const _AgentCard({required this.agent, required this.t});

  final DmcaAgent? agent;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = agent;
    final known = a != null && !a.isEmpty;
    final text = known
        ? t.t('dmca.agent', {'name': a.name, 'email': a.email})
        : t.t('dmca.agent.placeholder');
    return Container(
      key: const ValueKey('dmca-agent'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.goldStroke),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(
            AppIcons.policyOutlined,
            color: colors.goldDark,
            size: AppSizes.iconSm,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SelectableText(
                  text,
                  style: type.bodySmall.copyWith(color: colors.text),
                ),
                if (known && a.address.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xs),
                  SelectableText(
                    a.address,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
