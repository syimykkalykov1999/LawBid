import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/cases/tools/signing_data.dart';
import 'package:lawbid/features/cases/tools/signing_sheets.dart';
import 'package:lawbid/features/cases/tools/template_form_logic.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: "Create from template" — pick a template, fill its
/// form, get a PDF in the case files, and offer it for signature.
Future<void> showTemplateSheet(BuildContext context, String caseId) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => TemplateSheet(caseId: caseId),
    );

class TemplateSheet extends ConsumerStatefulWidget {
  const TemplateSheet({required this.caseId, super.key});

  final String caseId;

  @override
  ConsumerState<TemplateSheet> createState() => _TemplateSheetState();
}

class _TemplateSheetState extends ConsumerState<TemplateSheet> {
  api.FormTemplateDto? _template;
  api.BuiltDocumentDto? _built;
  String _lang = 'en';
  final Map<String, TextEditingController> _controllers = {};
  Map<String, FieldProblem> _problems = {};
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _choose(api.FormTemplateDto template, Map<String, String> prefill) {
    final app =
        (ref.read(languageControllerProvider).value ?? AppLanguage.en).code;
    for (final c in _controllers.values) {
      c.dispose();
    }
    _controllers.clear();
    final start = initialValues(template, prefill);
    for (final f in template.fields) {
      _controllers[f.key] = TextEditingController(text: start[f.key] ?? '');
    }
    setState(() {
      _template = template;
      _lang = pickLanguage(template.languages, app);
      _problems = {};
      _error = null;
    });
  }

  Future<void> _build() async {
    final template = _template;
    if (template == null || _busy) return;
    final t = ref.read(translatorProvider);
    final values = {
      for (final e in _controllers.entries) e.key: e.value.text,
    };
    final problems = checkForm(template.fields, values);
    if (problems.isNotEmpty) {
      setState(() => _problems = problems);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _problems = {};
    });
    try {
      final built = await ref.read(caseSigningActionsProvider).build(
            widget.caseId,
            templateId: template.id,
            language: _lang,
            values: cleanValues(template.fields, values),
          );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _built = built;
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = signingErrorText(t, e);
      });
    }
  }

  Future<void> _send() async {
    final built = _built;
    if (built == null || _busy) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(caseSigningActionsProvider).requestFromFile(
            widget.caseId,
            fileId: built.fileId,
            title: built.title,
          );
      if (!mounted) return;
      showAppSnackBar(context, t.t('sign.sent'));
      Navigator.of(context).pop();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = signingErrorText(t, e);
      });
    }
  }

  Future<void> _pickDate(String key) async {
    final c = _controllers[key];
    if (c == null) return;
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: parseIsoDate(c.text.trim()) ?? now,
      firstDate: DateTime(now.year - 100),
      lastDate: DateTime(now.year + 50),
    );
    if (!mounted || picked == null) return;
    setState(() {
      c.text = isoDate(picked);
      _problems = {..._problems}..remove(key);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final built = _built;
    final template = _template;
    if (built != null) {
      return SigningSheetFrame(
        title: t.t('docs.ready'),
        child: _Done(
          built: built,
          busy: _busy,
          error: _error,
          onSend: _send,
        ),
      );
    }
    if (template != null) {
      return SigningSheetFrame(
        title: pickText(template.title, _lang),
        child: _Form(
          template: template,
          lang: _lang,
          controllers: _controllers,
          problems: _problems,
          busy: _busy,
          error: _error,
          onLang: (l) => setState(() => _lang = l),
          onDate: _pickDate,
          onChanged: (key) {
            if (_problems.containsKey(key)) {
              setState(() => _problems = {..._problems}..remove(key));
            }
          },
          onBuild: _build,
          onBack: () => setState(() => _template = null),
        ),
      );
    }
    final value = ref.watch(caseFormTemplatesProvider(widget.caseId));
    return SigningSheetFrame(
      title: t.t('docs.pick'),
      child: value.when(
        loading: () => const AppSkeleton(height: 120),
        error: (e, _) => Text(signingErrorText(t, e)),
        data: (d) {
          if (d.templates.isEmpty) return Text(t.t('docs.empty'));
          final app =
              (ref.watch(languageControllerProvider).value ?? AppLanguage.en)
                  .code;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final tpl in d.templates)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _TemplateRow(
                    title: pickText(tpl.title, app),
                    description: pickText(tpl.description, app),
                    onTap: () => _choose(tpl, d.prefill),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _TemplateRow extends StatelessWidget {
  const _TemplateRow({
    required this.title,
    required this.description,
    required this.onTap,
  });

  final String title;
  final String description;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          AppIcon(AppIcons.descriptionOutlined, color: colors.accent),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: type.body.copyWith(fontWeight: FontWeight.w700),
                ),
                if (description.isNotEmpty)
                  Text(
                    description,
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Form extends ConsumerWidget {
  const _Form({
    required this.template,
    required this.lang,
    required this.controllers,
    required this.problems,
    required this.busy,
    required this.error,
    required this.onLang,
    required this.onDate,
    required this.onChanged,
    required this.onBuild,
    required this.onBack,
  });

  final api.FormTemplateDto template;
  final String lang;
  final Map<String, TextEditingController> controllers;
  final Map<String, FieldProblem> problems;
  final bool busy;
  final String? error;
  final ValueChanged<String> onLang;
  final ValueChanged<String> onDate;
  final ValueChanged<String> onChanged;
  final VoidCallback onBuild;
  final VoidCallback onBack;

  String? _problemText(Translator t, String key) => switch (problems[key]) {
        FieldProblem.required => t.t('docs.required'),
        FieldProblem.invalid => t.t('docs.invalid'),
        FieldProblem.tooLong => t.t('docs.tooLong'),
        null => null,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (template.languages.length > 1) ...[
          Text(t.t('docs.lang'), style: type.bodySmall),
          const SizedBox(height: AppSpacing.xs),
          FilterChips<String>(
            value: lang,
            padding: EdgeInsets.zero,
            options: [for (final l in template.languages) (l, l.toUpperCase())],
            onChanged: busy ? (_) {} : onLang,
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        for (final f in template.fields) ...[
          _FieldInput(
            field: f,
            label: pickText(f.label, lang) + (f.requiredValue ? ' *' : ''),
            controller: controllers[f.key]!,
            errorText: _problemText(t, f.key),
            enabled: !busy,
            pickLabel: t.t('docs.pickDate'),
            onDate: () => onDate(f.key),
            onChanged: () => onChanged(f.key),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: Semantics(
              liveRegion: true,
              child: Text(
                error!,
                style: type.bodySmall.copyWith(
                  color:
                      Theme.of(context).extension<AppColorTokens>()!.dangerText,
                ),
              ),
            ),
          ),
        AppButton(
          label: t.t('docs.build'),
          icon: AppIcons.pictureAsPdfRounded,
          isLoading: busy,
          onPressed: onBuild,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: t.t('common.back'),
          variant: AppButtonVariant.secondary,
          isEnabled: !busy,
          onPressed: onBack,
        ),
      ],
    );
  }
}

class _FieldInput extends StatelessWidget {
  const _FieldInput({
    required this.field,
    required this.label,
    required this.controller,
    required this.errorText,
    required this.enabled,
    required this.pickLabel,
    required this.onDate,
    required this.onChanged,
  });

  final api.FormFieldDto field;
  final String label;
  final TextEditingController controller;
  final String? errorText;
  final bool enabled;
  final String pickLabel;
  final VoidCallback onDate;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    if (field.type == api.FormFieldDtoType.date) {
      return _DateInput(
        label: label,
        controller: controller,
        errorText: errorText,
        enabled: enabled,
        pickLabel: pickLabel,
        onTap: onDate,
      );
    }
    return AppTextField(
      controller: controller,
      label: label,
      errorText: errorText,
      enabled: enabled,
      maxLines: field.type == api.FormFieldDtoType.textarea ? 5 : 1,
      maxLength: fieldMaxLength(field.type),
      keyboardType: switch (field.type) {
        api.FormFieldDtoType.number =>
          const TextInputType.numberWithOptions(decimal: true, signed: true),
        api.FormFieldDtoType.textarea => TextInputType.multiline,
        _ => TextInputType.text,
      },
      textCapitalization: field.type == api.FormFieldDtoType.number
          ? TextCapitalization.none
          : TextCapitalization.sentences,
      onChanged: (_) => onChanged(),
    );
  }
}

class _DateInput extends ConsumerWidget {
  const _DateInput({
    required this.label,
    required this.controller,
    required this.errorText,
    required this.enabled,
    required this.pickLabel,
    required this.onTap,
  });

  final String label;
  final TextEditingController controller;
  final String? errorText;
  final bool enabled;
  final String pickLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final formats = ref.watch(l10nFormatsProvider);
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final date = parseIsoDate(controller.text.trim());
        final shown = date == null ? pickLabel : formats.date(date);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: type.bodySmall),
            const SizedBox(height: AppSpacing.xs),
            Semantics(
              button: true,
              label: '$label: $shown',
              excludeSemantics: true,
              child: InkWell(
                onTap: enabled ? onTap : null,
                borderRadius: BorderRadius.circular(AppRadii.field),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 44),
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.sm,
                  ),
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: errorText == null ? colors.border : colors.danger,
                    ),
                    borderRadius: BorderRadius.circular(AppRadii.field),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          shown,
                          style: type.body.copyWith(
                            color: date == null
                                ? colors.textSecondary
                                : colors.text,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      const AppIcon(AppIcons.eventNoteOutlined, size: 20),
                    ],
                  ),
                ),
              ),
            ),
            if (errorText != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  errorText!,
                  style: type.caption.copyWith(color: colors.dangerText),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _Done extends ConsumerWidget {
  const _Done({
    required this.built,
    required this.busy,
    required this.error,
    required this.onSend,
  });

  final api.BuiltDocumentDto built;
  final bool busy;
  final String? error;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final url = built.url;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            AppIcon(AppIcons.checkCircleRounded, color: colors.successText),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    built.title,
                    style: type.body.copyWith(fontWeight: FontWeight.w700),
                  ),
                  Text(
                    t.t('docs.inFiles'),
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        if (url != null) ...[
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FileOpenButton.ref(
              file: FileRef(
                fileId: built.fileId,
                mime: 'application/pdf',
                url: url,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: Text(
              error!,
              style: type.bodySmall.copyWith(color: colors.dangerText),
            ),
          ),
        AppButton(
          label: t.t('docs.send'),
          icon: AppIcons.editNoteRounded,
          isLoading: busy,
          onPressed: onSend,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: t.t('common.done'),
          variant: AppButtonVariant.secondary,
          isEnabled: !busy,
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}
