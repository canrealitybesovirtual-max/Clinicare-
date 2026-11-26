/**
 * Attributes for every free-text field that can hold clinical text (G5/G17).
 *
 * Browser "enhanced" spellcheckers (for example Chrome Enhanced Spell Check or Microsoft Editor) and
 * writing-assistant extensions can send a field's contents to their vendor's servers. That would be an
 * outbound path for typed text outside the app's Content Security Policy, and it could include raw text
 * during the short delay before the PHI scrubber runs. These attributes opt the field out: native
 * spellcheck, autocorrect and autocapitalize off, and the opt-out markers that Grammarly honors.
 * They are hints, not a guarantee; /about tells clinicians to keep such tools off for this site.
 */
export const PRIVATE_TEXT_FIELD_PROPS = {
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
  autoComplete: "off",
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  "data-lt-active": "false",
} as const;
