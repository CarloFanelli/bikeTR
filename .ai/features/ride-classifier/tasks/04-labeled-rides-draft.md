# Task 04: labeled-rides-draft

## Objective

One command turns about 40 of the athlete's saved rides into anonymized draft Labeled rides, each with a proposed Ride label, in a file outside git for the user to correct.

## Context

**Satisfies**: REQ-12, REQ-13, REQ-14

Strava data may not be published, so the Labeled rides that measure the classifier are anonymized copies. The draft stays local until the user has corrected the labels and checked the names; only then does it enter the repository as the Labeled rides file Task 05 reads.

## Depends on

- Task 01

## Expected Behavior

- The command picks about 40 saved bike rides with the fields the classifier reads.
- Each drafted ride has an invented date, numbers changed by a few percent, a rewritten name, and no Strava id, route or real date.
- Each drafted ride has an empty label field; the proposed label is written during development by Claude, reading name and numbers, never by the Label rule or the Label model, then corrected by the user.
- The draft is written to a file kept out of git; the command prints how many rides it wrote and how to finish the file.

## Acceptance Criteria

- [ ] The command writes up to 40 rides to a draft file that git ignores (REQ-12)
- [ ] No drafted ride contains a Strava id, route, real date or the original name (REQ-13)
- [ ] Each drafted number differs from the original by at most a few percent (REQ-13)
- [ ] Each drafted ride has a label field the command leaves empty, ready for the proposal (REQ-14)
- [ ] The command's output says how to correct the labels and where the reviewed file goes (REQ-14)

## Edge Cases

- Fewer than 40 saved rides → writes as many as there are and says how many (REQ-12)
- No saved rides (not connected to Strava) → stops with a message saying to connect and sync first (REQ-12)
- Draft file already exists → overwritten, the command says so (REQ-12)
- Ride name with a place or a person ("Giro del lago con Marco") → rewritten without them ("Giro lungo") (REQ-13)
- Proposed labels coming from the Label rule → never: the rule would score its own proposals as correct (REQ-14 · from code)
- N/A — permission: single local user, no roles (REQ-12)

## Notes from implementation

- **ARCHITECTURE.md divergence**: the jitter is not seeded; the command uses a system random source. A seed kept in the public repository would let anyone undo the jitter and recover the real numbers. Tests pass their own seeded generator.
