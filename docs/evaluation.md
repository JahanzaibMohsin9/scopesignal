# Evaluation

How the PDF parser, retrieval settings, classifier prompt and model were chosen. Each section has a script you can re-run. Raw results are kept next to this file as JSON.

## PDF parsing

```bash
npm run benchmark:pdf
```

The benchmark compared `pdf-parse` with `pdfjs-dist` on 7 public PDFs: website and marketing proposals, long public-sector RFPs, tabular evaluation sections, appendices, and an executed contract packet with signature pages. The sample list is `pdf-samples.json` and the metrics are in `pdf-parser-results.json`.

| Sample | Pages | `pdf-parse` clean text | `pdfjs-dist` clean text |
|---|---:|---:|---:|
| Website Design and Development RFP | 86 | 86% | 83% |
| Administrative Services RFP Board Packet | 15 | 92% | 91% |
| Marketing Services RFP | 5 | 90% | 88% |
| Data Reporting System RFP | 56 | 88% | 87% |
| Website Update RFP | 11 | 93% | 91% |
| Website Redesign Services RFP | 13 | 88% | 87% |
| Equipment and Installation Contract | 10 | 89% | 88% |

Clean-text scores are reviewer estimates of paragraph readability, line order and artifact frequency.

**Decision:** `pdf-parse` is the primary extractor. It reads better and keeps table spacing in cost summaries and evaluation grids. `pdfjs-dist` is kept as a fallback, and for page rendering. Both leave repeated headers and footers in long RFPs, so normalization strips page numbers, title blocks and repeated footer lines before chunking.

Known gaps: image-only scans need an OCR or vision fallback. The planned trigger is fewer than 50 words on a normal-sized page, and only those pages are sent to a vision model. Multi-column layouts may also need coordinate-aware reading order.

## Retrieval

```bash
npm run evaluate:retrieval
```

The fixture (`retrieval-evaluation-set.json`) has 20 labelled Slack-style client questions mapped to the expected clauses of a demo proposal plus a paid-media addendum, with six distractor clauses. The harness runs candidates through the production `rerankRetrievedChunks` function. Results are written to `retrieval-evaluation-results.json`.

| Config | Candidates | Final chunks | Threshold | Hit@K | All expected Hit@K | MRR |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 10 | 5 | 0.20 | 100% | 100% | 0.800 |
| stricter threshold | 10 | 5 | 0.35 | 100% | 100% | 0.800 |
| smaller candidate pool | 6 | 5 | 0.20 | 100% | 100% | 0.825 |
| compact final context | 10 | 3 | 0.20 | 100% | 100% | 0.800 |

**Production settings:**
- 10 candidates and the top 5 go to the classifier. Six candidates were enough on this small fixture, but real proposals benefit from the extra recall.
- No hard similarity threshold, because real embedding scores vary by model.
- Chunks of about 1,000 tokens with a 150-token overlap.
- An addendum recency boost of `2`, so a newer signed addendum always outranks the older clause it replaces.

## Classifier prompt

The system prompt (`lib/openai/classification.ts`) separates three inputs:

- `client_message`: the Slack request being classified.
- `thread_context`: used for intent only, never as contract evidence.
- `scope_chunks`: ranked proposal and addendum excerpts, the only allowed evidence.

Confidence is calibrated conservatively:

| Confidence | Meaning |
|---|---|
| 0.85–1.00 | Direct, clear evidence in a cited chunk |
| 0.65–0.84 | Likely, but the evidence is imperfect |
| below 0.65 | Ambiguous, missing or conflicting evidence, so `needs_review` |

Every verdict must cite its evidence as `Document Title > Section Title (chunk_id)`. The regression suite mocks the Responses API and covers 5 clear in-scope and 5 clear out-of-scope scenarios. Out-of-scope examples include an excluded event microsite, Shopify checkout under an "ecommerce excluded" clause, and an ERP integration that needs a change order.

## Model selection

```bash
npm run benchmark:classification
```

Both models ran the 10-scenario evaluation set through the production `classifyScope` wrapper. Raw results are in `classification-model-benchmark.json`.

| Model | Accuracy | Avg latency | Prompt tokens | Completion tokens | Run cost |
|---|---:|---:|---:|---:|---:|
| `gpt-5-mini` | 90% | 7,775 ms | 6,447 | 3,802 | $0.0092 |
| `gpt-5.2` | 90% | 2,027 ms | 6,447 | 847 | $0.0231 |

Both models missed the same case, a content update within a monthly cap, and both missed it conservatively: they flagged it for human review rather than giving a confident wrong answer.

**Decision:** `gpt-5-mini` is the default (`OPENAI_CLASSIFICATION_MODEL`). It matched accuracy at about 40% of the cost. `gpt-5.2` can be set as an escalation model (`OPENAI_ESCALATION_MODEL`) for re-checking uncertain results, but the scope worker doesn't call it yet. Today, uncertain results go straight to human review (below).

## Human review rules

`lib/openai/classification-result.ts` normalizes model output before an alert is saved:

- Confidence below `0.6`, a `needs_review` verdict, or `needs_human_review = true` are all saved as `needs_review`.
- Explicitly unsure wording ("maybe", "not sure") defaults to `needs_review`.
- No retrieved chunks: the model is skipped and a low-confidence `needs_review` alert is created.
- Very long messages and threads are truncated before the model call.
- Non-English messages skip the model and go straight to human review.

Alerts are upserted on `workspace_id + slack_channel_id + slack_message_ts`, so Slack retries never create duplicates.
