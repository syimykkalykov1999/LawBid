import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/limits/text_limits.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';

/// Owner 2026-10-20: a client asks the lawyers — topic, state, title,
/// text, «hide my name».
class AskQuestionScreen extends ConsumerStatefulWidget {
  const AskQuestionScreen({this.initialState, super.key});

  final String? initialState;

  @override
  ConsumerState<AskQuestionScreen> createState() => _AskQuestionScreenState();
}

class _AskQuestionScreenState extends ConsumerState<AskQuestionScreen> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  QaAreaPick? _area;
  String? _state;
  bool _anonymous = false;
  bool _busy = false;
  String? _error;

  static const _titleMin = 5;
  static const _bodyMin = 10;

  @override
  void initState() {
    super.initState();
    _state = widget.initialState;
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  bool get _valid =>
      _title.text.trim().length >= _titleMin &&
      _body.text.trim().length >= _bodyMin &&
      _area != null;

  Future<void> _pickArea() async {
    final t = ref.read(translatorProvider);
    final r = await pickQaArea(
      context,
      ref,
      title: t.t('qa.area'),
      current: _area?.id,
    );
    if (r == null || !mounted) return;
    setState(() => _area = r.id.isEmpty ? null : r);
  }

  Future<void> _pickState() async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('qa.state'),
      options: [
        for (final s in kRegions)
          PickerOption(value: s.code, label: s.name, sublabel: s.code),
      ],
      initial: {if (_state != null) _state!},
    );
    if (picked == null || !mounted) return;
    setState(() => _state = picked.isEmpty ? null : picked.first);
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final q = await ref.read(legalQaRepositoryProvider).ask(
            title: _title.text.trim(),
            body: _body.text.trim(),
            practiceAreaId: _area?.id,
            stateCode: _state,
            anonymous: _anonymous,
          );
      ref.read(questionsTouchedProvider.notifier).bump();
      if (!mounted) return;
      showAppSnackBar(context, t.t('qa.sent'));
      context.pop();
      unawaited(context.push(LegalQaRoutes.question(q.id)));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e is ApiException && e.code == ApiErrorCodes.rateLimited
            ? t.t('qa.limit')
            : errorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final stateLabel = _state == null
        ? t.t('qa.state.any')
        : kRegions
            .firstWhere(
              (s) => s.code == _state,
              orElse: () => UsState(_state!, _state!),
            )
            .name;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('qa.ask')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            Row(
              children: [
                Expanded(
                  child: AppChip(
                    label: _area?.label ?? t.t('qa.area'),
                    expand: true,
                    selected: _area != null,
                    trailing: AppIcon(
                      AppIcons.expandMoreRounded,
                      size: 18,
                      color: colors.textSecondary,
                    ),
                    onTap: _pickArea,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppChip(
                    label: stateLabel,
                    expand: true,
                    selected: _state != null,
                    trailing: AppIcon(
                      AppIcons.expandMoreRounded,
                      size: 18,
                      color: colors.textSecondary,
                    ),
                    onTap: _pickState,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              controller: _title,
              label: t.t('qa.field.title'),
              semanticLabel: t.t('qa.field.title'),
              maxLength: TextLimits.of(TextLimit.questionTitle),
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.next,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              controller: _body,
              label: t.t('qa.field.body'),
              semanticLabel: t.t('qa.field.body'),
              tapAnywhere: true,
              maxLines: 8,
              minHeight: 160,
              maxLength: TextLimits.of(TextLimit.questionBody),
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.sm),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              value: _anonymous,
              activeTrackColor: colors.gold,
              title: Text(
                t.t('qa.anonSwitch'),
                style: type.body.copyWith(color: colors.text),
              ),
              subtitle: Text(
                t.t('qa.anonHint'),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              onChanged: (v) => setState(() => _anonymous = v),
            ),
            const SizedBox(height: AppSpacing.md),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    _error!,
                    style: type.body.copyWith(color: colors.dangerText),
                  ),
                ),
              ),
            AppButton(
              label: t.t('qa.send'),
              isLoading: _busy,
              isEnabled: _valid,
              disabledHint: t.t('qa.fill'),
              onPressed: _valid ? () => unawaited(_send()) : null,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('qa.disclaimer'),
              style: type.legalFine.copyWith(color: colors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
