import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// A word-list filter is a first line of defence, not a substitute for review.
export function containsBlockedLanguage(content: string): boolean {
  return matcher.hasMatch(content);
}

export function prepareTimeoutDraft(content: string, maxWords: number):
  | { kind: "empty" | "blocked" }
  | { kind: "ready"; content: string } {
  const words = content.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { kind: "empty" };
  // Check the complete draft as well as the submitted text, rather than
  // allowing text beyond the word limit to bypass the normal safety check.
  if (containsBlockedLanguage(content)) return { kind: "blocked" };
  return { kind: "ready", content: words.slice(0, maxWords).join(" ") };
}
