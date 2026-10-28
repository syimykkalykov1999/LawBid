import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/addresses/address_suggestions.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-28: every address input in the app. An [AppTextField]
/// (same look, same parameters) that suggests real US addresses while the
/// person types, like Google Maps / Uber: after [kAddressMinChars] letters
/// and a [kAddressDebounce] pause it asks `GET /addresses/suggest`; a tap on
/// a line fills the field. With the suggestions off on the server (switch,
/// no key, monthly cap) or offline, it is exactly the old text field.
class AddressField extends ConsumerStatefulWidget {
  const AddressField({
    required this.controller,
    super.key,
    this.kind = AddressKind.address,
    this.label,
    this.hintText,
    this.semanticLabel,
    this.leading,
    this.errorText,
    this.maxLines = 1,
    this.maxLength,
    this.autofocus = false,
    this.textCapitalization = TextCapitalization.words,
    this.textInputAction,
    this.autofillHints = const [AutofillHints.fullStreetAddress],
    this.onChanged,
    this.onSelected,
    this.debounce = kAddressDebounce,
  });

  final TextEditingController controller;
  final AddressKind kind;
  final String? label;
  final String? hintText;
  final String? semanticLabel;
  final Widget? leading;
  final String? errorText;
  final int maxLines;
  final int? maxLength;
  final bool autofocus;
  final TextCapitalization textCapitalization;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;

  /// Every change of the text, typed or picked.
  final ValueChanged<String>? onChanged;

  /// A suggestion was tapped (after the field was filled).
  final ValueChanged<AddressSuggestion>? onSelected;
  final Duration debounce;

  @override
  ConsumerState<AddressField> createState() => _AddressFieldState();
}

class _AddressFieldState extends ConsumerState<AddressField> {
  Timer? _timer;
  int _seq = 0;
  bool _serverOff = false;
  List<AddressSuggestion> _items = const [];
  String? _picked;
  String? _session;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _onChanged(String text) {
    widget.onChanged?.call(text);
    _timer?.cancel();
    final q = text.trim();
    if (_serverOff || q.length < kAddressMinChars || q == _picked) {
      _seq++;
      if (_items.isNotEmpty) setState(() => _items = const []);
      return;
    }
    _timer = Timer(widget.debounce, () => unawaited(_ask(q)));
  }

  Future<void> _ask(String q) async {
    final seq = ++_seq;
    _session ??= newAddressSession();
    final res = await ref
        .read(addressSuggestionsRepositoryProvider)
        .suggest(q, kind: widget.kind, session: _session);
    // A newer key stroke (or a pick) won: this answer is stale.
    if (!mounted || seq != _seq) return;
    setState(() {
      _serverOff = !res.enabled;
      _items = [
        for (final s in res.items)
          if (s.fill(widget.kind) != q) s,
      ];
    });
  }

  void _pick(AddressSuggestion s) {
    final text = s.fill(widget.kind);
    _timer?.cancel();
    _seq++;
    _picked = text;
    _session = null; // the next address is a new session
    widget.controller.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
    setState(() => _items = const []);
    widget.onChanged?.call(text);
    widget.onSelected?.call(s);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          controller: widget.controller,
          label: widget.label,
          hintText: widget.hintText,
          semanticLabel: widget.semanticLabel,
          leading: widget.leading,
          errorText: widget.errorText,
          maxLines: widget.maxLines,
          maxLength: widget.maxLength,
          autofocus: widget.autofocus,
          keyboardType: TextInputType.streetAddress,
          textCapitalization: widget.textCapitalization,
          textInputAction: widget.textInputAction,
          autofillHints: widget.autofillHints,
          onChanged: _onChanged,
        ),
        if (_items.isNotEmpty)
          // Taps on the lines belong to the field: the keyboard stays and
          // the sheet does not jump under the finger.
          TextFieldTapRegion(
            child: Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Column(
                key: const ValueKey('address-suggestions'),
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final (i, s) in _items.indexed)
                    AppListRow(
                      key: ValueKey('address-suggestion-$i'),
                      icon: AppIcons.placeOutlined,
                      label: s.label,
                      showChevron: false,
                      dense: true,
                      onTap: () => _pick(s),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
