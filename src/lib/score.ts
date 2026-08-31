// ============================================================================
// score.ts — significance scoring.
//   significance = source_count (corroboration) + topic_match_score
// Soul.md principle #5: significance has a bar. Thresholds live here.
//
// Language/multi-source note: the topic TOKEN LISTS are no longer hardcoded
// here. They come from the DB (migration 0002): a shared per-language default
// plus a per-user override. Callers pass the effective token set in, so this
// module stays pure and testable. pitch():
//   scoreEvent({ title, summary, sourceCount, tokens }) 
// ============================================================================

export interface ScoreInput {
  title: string;
  summary: string;
  sourceCount: number;
  /** Effective significance keywords for the event's language(s). */
  tokens: string[];
}

export interface ScoredEvent {
  significanceScore: number;
  sourceCount: number;
  topicMatchScore: number;
}

// Thresholds — the "bar" (soul.md principle #5). Tune here, not in callers.
export const THRESHOLDS = {
  /** Auto-approve (no human needed) above this combined score. */
  autoApprove: 4,
  /** Deemed significant enough to surface as a timeline entry. */
  propose: 2,
};

function topicMatch(title: string, summary: string, tokens: string[]): number {
  const text = `${title} ${summary}`.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (text.includes(token.toLowerCase())) hits++;
  }
  return hits;
}

export function scoreEvent(input: ScoreInput): ScoredEvent {
  // Corroboration is the strongest signal (soul.md principle #2):
  // 1 = first hit, 4 = two sources, 8 = 3+ sources.
  let sourceCount = 0;
  if (input.sourceCount >= 4) sourceCount = 8;
  else if (input.sourceCount >= 3) sourceCount = 6;
  else if (input.sourceCount >= 2) sourceCount = 4;
  else sourceCount = 1;

  const topicMatchScore = topicMatch(input.title, input.summary, input.tokens);

  return {
    significanceScore: sourceCount + topicMatchScore,
    sourceCount,
    topicMatchScore,
  };
}