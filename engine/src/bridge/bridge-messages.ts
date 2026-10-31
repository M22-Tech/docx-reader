import { z } from 'zod';

const documentErrorCode = z.enum([
  'empty',
  'unsupported_format',
  'encrypted',
  'unsupported_version',
  'corrupt',
  'timeout',
]);
const mode = z.enum(['raw', 'rendered']);
const format = z.enum(['docx', 'doc', 'rtf', 'odt', 'html']);

export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark']),
  textSizePx: z.number(),
  fontStyle: z.enum(['serif', 'sans']),
  colors: z.object({ ink: z.string(), paper: z.string() }),
});

export const openMessageSchema = z.object({
  type: z.literal('open'),
  name: z.string(),
  base64: z.string(),
  mode,
  settings: settingsSchema,
});
export const setModeMessageSchema = z.object({ type: z.literal('setMode'), mode });
export const setSettingsMessageSchema = z.object({ type: z.literal('setSettings'), settings: settingsSchema });

export const readyMessageSchema = z.object({ type: z.literal('ready') });
export const renderedMessageSchema = z.object({
  type: z.literal('rendered'),
  format,
  mode,
  durationMs: z.number(),
  otherModeAvailable: z.boolean(),
});
export const errorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.union([documentErrorCode, z.literal('internal')]),
  message: z.string(),
});
export const openLinkMessageSchema = z.object({ type: z.literal('openLink'), href: z.string() });

export const appMessageSchema = z.discriminatedUnion('type', [
  openMessageSchema,
  setModeMessageSchema,
  setSettingsMessageSchema,
]);
export const pageMessageSchema = z.discriminatedUnion('type', [
  readyMessageSchema,
  renderedMessageSchema,
  errorMessageSchema,
  openLinkMessageSchema,
]);

export type ViewerSettings = z.infer<typeof settingsSchema>;
export type OpenMessage = z.infer<typeof openMessageSchema>;
export type SetModeMessage = z.infer<typeof setModeMessageSchema>;
export type SetSettingsMessage = z.infer<typeof setSettingsMessageSchema>;
export type ReadyMessage = z.infer<typeof readyMessageSchema>;
export type RenderedMessage = z.infer<typeof renderedMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type OpenLinkMessage = z.infer<typeof openLinkMessageSchema>;
/** Messages the app sends to the page. */
export type AppMessage = z.infer<typeof appMessageSchema>;
/** Messages the page sends to the app. */
export type PageMessage = z.infer<typeof pageMessageSchema>;

/** Validates a message from the app; returns null for anything unknown or malformed. */
export function parseAppMessage(raw: unknown): AppMessage | null {
  const result = appMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Validates a message from the page; returns null for anything unknown or malformed. */
export function parsePageMessage(raw: unknown): PageMessage | null {
  const result = pageMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
