import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';

/// The "@…" being typed right before the cursor, or null.
({int start, String query})? mentionQueryAt(TextEditingValue v) {
  final cursor = v.selection.baseOffset;
  if (cursor < 0 || cursor > v.text.length) return null;
  final before = v.text.substring(0, cursor);
  final m =
      RegExp(r'(?:^|[^A-Za-z0-9._@])@([A-Za-z0-9._]*)$').firstMatch(before);
  if (m == null) return null;
  final query = m.group(1)!;
  return (start: cursor - query.length - 1, query: query);
}

/// Replaces the "@…" before the cursor with "@username " and moves the
/// cursor after it.
TextEditingValue insertMention(TextEditingValue v, String username) {
  final q = mentionQueryAt(v);
  if (q == null) return v;
  final cursor = v.selection.baseOffset;
  final text = v.text.replaceRange(q.start, cursor, '@$username ');
  return TextEditingValue(
    text: text,
    selection: TextSelection.collapsed(offset: q.start + username.length + 2),
  );
}

/// OQ-042: while "@an…" is typed, people whose @username or name matches
/// appear under the field (attorneys and clients, like Instagram); a tap
/// puts "@username " into the text.
class MentionSuggestions extends ConsumerStatefulWidget {
  const MentionSuggestions({required this.controller, super.key});

  final TextEditingController controller;

  @override
  ConsumerState<MentionSuggestions> createState() => _MentionSuggestionsState();
}

class _MentionSuggestionsState extends ConsumerState<MentionSuggestions> {
  Timer? _debounce;
  String? _query;
  List<PersonRow> _people = const [];
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    _debounce?.cancel();
    super.dispose();
  }

  void _changed() {
    final q = mentionQueryAt(widget.controller.value)?.query;
    if (q == _query) return;
    _query = q;
    _debounce?.cancel();
    if (q == null || q.isEmpty) {
      if (_people.isNotEmpty) setState(() => _people = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 250), () => _search(q));
  }

  Future<void> _search(String q) async {
    final seq = ++_seq;
    try {
      final page = await ref
          .read(searchRepositoryProvider)
          .people(q, const SearchFilters());
      if (!mounted || seq != _seq || _query != q) return;
      setState(() => _people = page.items.take(6).toList());
    } on Object {
      if (mounted && seq == _seq) setState(() => _people = const []);
    }
  }

  void _pick(PersonRow p) {
    AppHaptics.selection();
    _query = null;
    widget.controller.value =
        insertMention(widget.controller.value, p.username);
    setState(() => _people = const []);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AnimatedSize(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      alignment: Alignment.topCenter,
      child: _people.isEmpty
          ? const SizedBox(width: double.infinity)
          : Container(
              width: double.infinity,
              margin: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final p in _people)
                    PersonSuggestionTile(
                      key: ValueKey('mention-${p.id}'),
                      person: SuggestedPerson.fromRow(p),
                      avatarSize: 36,
                      inset: AppSpacing.md,
                      onTap: () => _pick(p),
                    ),
                ],
              ),
            ),
    );
  }
}
