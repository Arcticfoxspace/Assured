// src/lib/server/limits.ts — request limits shared by routes and their tests.
// (Next.js route files may only export HTTP handlers and config, so constants live here.)

/** Hard ceiling on a Mewvi request body. A message itself is capped at 500 characters later. */
export const MAX_MEWVI_BODY_CHARS = 4096;
