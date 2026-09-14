# Open item 8: the shared result object cannot express a series

| Field | Value |
|---|---|
| URS | C4 v0.4, C4-OUT-04, open item 8 |
| Status | **Escalation.** The format cannot express what C4 produces |
| Owner | Developer, with NADIRA co-owning |
| Date | 14 September 2026 |
| Blocks | Build. Resolved as below so that build could proceed |

C4-OUT-04 requires the structured object to use the same format as C1 and the
shipped Antigen Density Calculator, and requires that if that format cannot
express a series, the developer **stop and escalate rather than extend it
locally**. This is that escalation.

## What was examined

Both siblings were read at source rather than inferred from the build brief.

- `abmodi-ai/Ligant.ai-Antigen-Density-Calculator` at v0.1.3
- `abmodi-ai/Ligant.ai-Molarity-Converter`, C1, at v0.1.0

## Finding 1: the ADC has no structured result object

The ADC exports CSV and SVG. There is no JSON result object, no schema, and no
`toJSON` anywhere in it. Its closest thing to a machine contract is the header
row of its CSV export.

This is not a new finding. C1 recorded it before this tool existed, and says so
in the header of its own `src/lib/serialise.ts`:

> C1-OUT-04 requires the object to use the shipped Antigen Density Calculator's
> format, and that format does not exist.

C1 held its own structured output behind that finding for a time, then
separated the two requirements: it emitted an object of its own and left the
hold on the ADC half standing. The build brief's note on item 8 reaches the same
conclusion from outside: *"The 'shared format' C4-OUT-04 refers to is therefore
whatever C1 shipped, not anything in the ADC public source."*

**So the ADC half of C4-OUT-04 is not satisfiable, and has already been
escalated once.** Nothing in C4 changes that.

## Finding 2: C1's object cannot carry a series

C1's schema is `ligant-benchtools-c1-conversion`, at version 1.4.0. It describes
ONE conversion. Two properties make it unable to describe a series, and neither
is incidental:

```ts
export interface StructuredResult {
  schema: { name: string; version: string }
  tool: { id: string; name: string; engineVersion: string }
  direction: Direction
  entered: 'mass' | 'molar'
  quantities: {
    massConcentration: Quantity<MassUnit>
    molarConcentration: Quantity<MolarUnit>
    molecularWeight: Quantity<MwUnit>
    effectiveDivisor: Quantity<string>
  }
  declarations: { ... }
  displayed: { ... }
  flags: StructuredFlag[]
  derivation: { ... }
  statements: { ... }
}
```

1. **`quantities` is a flat record of four fixed keys.** There is no ordered
   dimension anywhere in the object. A C4 series is an ordered set of up to
   twelve points, each carrying up to six forms, and the order is data: the
   point index is the thing a bench scientist works from.

2. **`flags` is a flat array with no point scope.** `StructuredFlag` carries
   `code`, `message`, `evaluatedOn` and `kind`, and nothing that names a point.

The second is the one C4-OUT-04 singles out, and its note says why:

> C4-FL-03 names specific points. A series-level flag list loses which. Whatever
> format is chosen for the escalation must carry point-level flag scope, or gate
> item 9 fails at the boundary.

That is not a hypothetical. In the reference case of acceptance 1, C4-FL-03
fires on points 3 to 6 and not on points 1 and 2, and the remedy is to prepare
an intermediate working stock for exactly those four. A consumer that received
only "C4-FL-03 was raised" could not plan it. C3's first titration-facing
requirement is to consume this object and do precisely that.

**None of this is a defect in C1.** It is a single-value tool and its object is
the right shape for one value. The requirement asked a single-value format to
carry a series, and it cannot.

## What was done instead

C4 owns a schema, `ligant-benchtools-c4-series`, versioned separately from the
engine exactly as C1 versions its own and for the same reason: a change to the
shape of the object is not a change to the numbers, and versioning the two
together would make one of them lie.

**What C4 did NOT do is invent a vocabulary.** Every shape C1 already defines is
reused verbatim, so a consumer written against one can read the other's parts
without translation:

| Reused from C1 | Unchanged |
|---|---|
| `Quantity { value, unit, underflowed }` | `value` is the unrounded double, per C4-UN-07 as C1-UN-07 |
| `StructuredFlag { code, message, evaluatedOn, kind }` | the code is the URS identifier |
| the `schema` / `tool` division | |
| `declarations`, `displayed`, `derivation`, `statements` | |
| `reproduceFrom`, `validateStructuredResult` | sufficiency established by execution, not by inspection |

Two additions, both additive:

- **`points[].flags`**, the point-level array C4-OUT-04 names. It sits beside
  the series-level array, not instead of it, so neither view is the only one.
- **`flags[].points`**, so a series-level flag says which points it is about.

This is conformance to the contract rather than a local extension of it: nothing
in C1's object is altered, nothing of C1's is redefined, and no ADC shape has
been invented to stand in for one.

## What NADIRA is asked to decide

1. Whether a bench-tools format should exist at all, given that two of three
   tools have now independently concluded they need their own. C1's
   `serialise.ts` describes reconciliation as the thing `schema.version` exists
   to make visible; nothing has yet been reconciled.
2. If one should, whether it is a container with an ordered dimension into which
   both a single conversion and a series fit, or a set of per-tool schemas
   sharing the `Quantity` and `StructuredFlag` primitives, which is what exists
   in practice today.
3. Whether C4-OUT-04's reference to the ADC should be struck. It has now been
   escalated twice against a format that does not exist, and a requirement that
   cannot be met by any implementation costs a reader's attention on every
   review.

## Example

A serialised C4 series is emitted on the tool's own page under "Structured
result", and `reimpl/fixtures.json` holds the inputs that produce it.
`src/lib/schema.test.ts` validates every fixture against the schema, asserts the
point-level flag scope, and reproduces each result from the object alone.
