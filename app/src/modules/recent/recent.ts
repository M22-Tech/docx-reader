import { z } from 'zod';
import { DOCUMENT_FORMATS } from '../../config/constants';

export const recentEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  sizeBytes: z.number().nonnegative(),
  sha256: z.string(),
  /** Filled in by the viewer from the `rendered` message. */
  format: z.enum(DOCUMENT_FORMATS).optional().catch(undefined),
  openedAt: z.number(),
  /** URI of the private copy. */
  path: z.string().min(1),
});

export type RecentEntry = z.infer<typeof recentEntrySchema>;
