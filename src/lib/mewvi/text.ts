// src/lib/mewvi/text.ts — text hygiene for Mewvi. Isomorphic.
import { sanitizeUserText } from "@/lib/security/sanitize";

export const MAX_MESSAGE = 500;

/** Clean user text before anything else sees it. */
export function sanitizeMessage(input: string, max = MAX_MESSAGE): string {
  // eslint-disable-next-line no-control-regex
  const noControl = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  return sanitizeUserText(noControl, max);
}

/** Lower-case, punctuation-light form used for matching. Keeps apostrophes. */
export function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u00ad\u200b-\u200f\u2060\ufeff]/g, "") // accents and invisible characters must not hide a word
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Before any text leaves for an AI model: mask things ASSURED never needs the
 * model to see — emails, links, decimal coordinates, and phone / account-like digit runs.
 */
export function redactForModel(input: string): string {
  return input
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b[a-z0-9._-]{2,}@[a-z]{2,}\b/gi, "[upi]")
    .replace(/\bhttps?:\/\/\S+/gi, "[link]")
    .replace(/\b(?:www\.)\S+/gi, "[link]")
    .replace(/-?\b\d{1,3}\.\d{3,}\b/g, "[coordinates]")
    .replace(/\b[a-z]{5}\d{4}[a-z]\b/gi, "[id]")
    .replace(/\+?\d[\d\s-]{5,}\d/g, "[number]")
    .replace(/\b\d{4,}\b/g, "[number]")
    // U2 (session 5), best effort and cue-based only: names the person introduces themselves with, and address cues.
    .replace(NAME_CUE, (_m, cue: string) => `${cue} [name]`)
    .replace(HOUSE_CUE, "[address]")
    .replace(PLACE_CUE, "[address]");
}

const NOT_NAME = "(?!(?:hai|h|hain|ho|and|aur|is|i|am|from|me|mein|se|ke|ka|ki|the|a|back|later|soon|now|please|plz|asap|when|if|tomorrow|tonight|immediately|urgently|if)\\b)";
const NAME_WORD = `${NOT_NAME}[a-z][a-z.'-]*`;
const NAME_CUE = new RegExp(`\\b(my name is|my name's|call me|mera naam(?: hai)?|mera nam(?: hai)?|meri naam(?: hai)?)\\s+${NAME_WORD}(?:\\s+${NAME_WORD}){0,2}`, "gi");
const HOUSE_CUE = /\b(?:flat|house|plot|room|door|h\.?\s?no\.?)\s*(?:no\.?|number|#)?\s*[a-z]?\d[\w/-]*/gi;
const PLACE_CUE = /\b(?:near|opposite|opp\.?|behind)\s+(?:the\s+)?(?!(?:the|a|an|my|his|her|our|this|that)\b)[a-z0-9'.-]+(?:\s+[a-z0-9'.-]+){0,3}?\s+(?:road|rd|nagar|colony|marg|gali|mohalla|chowk|apartments?|society|enclave|vihar)\b/gi;
