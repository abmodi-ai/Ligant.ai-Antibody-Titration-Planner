# Open item 9: the C1 to C4 transport, and its integrity check

| Field | Value |
|---|---|
| URS | C4 v0.4, C4-ST-06, C4-ST-07, C4-FX-21, acceptance 20 |
| Status | Designed and built |
| Owner | Developer, with NADIRA co-owning |
| Date | 14 September 2026 |
| Blocks | Build |

C4-ST-06 requires the mechanism by which a C1 result object reaches C4 to be
specified before build, to work with no server and no persistence, and to be the
same mechanism by which C4 hands a series to C3. C4-ST-07 requires an imported
object to carry an integrity check.

## The mechanism

**The URL fragment, carrying a base64url-encoded envelope.**

```
https://benchtools.ligant.ai/antibody-titration-planner/#c1=<base64url(envelope)>
```

```json
{ "v": 1, "kind": "c1-conversion", "payload": { ... }, "checksum": "9a3f..." }
```

### Why the fragment

The fragment is the only part of a URL a browser never transmits. It is not in
the request line, so it does not reach a server log, a referer header, an
intermediary or a CDN. That is what makes "no server" a property of the
mechanism rather than a promise someone has to keep. Three alternatives were
considered and rejected:

| Alternative | Why not |
|---|---|
| A query string | Transmitted with every request. It would put a user's declarations in a log, which is the one thing the tool set's privacy claim forbids. |
| `postMessage` between tabs | Requires both tools open at once and an opener relationship. C4-NF-05 requires C4 to be usable independently of any other tool. |
| `localStorage` under a shared origin | C4-ST-06 says no persistence. It would also leave a user's object on a shared machine after they had finished. |

### The same mechanism in the other direction

C4 to C3 is the same envelope with `kind: "c4-series"` and a C4 structured
result as the payload. Nothing in the encoding, the checksum or the rejection
messages is specific to the direction, which is what C4-ST-06 asks for.

### The C1-side change this requires

**C1 has no export today.** It produces the structured object in
`src/lib/serialise.ts` and renders it; nothing writes a link. C1 gains:

1. A function that wraps `toStructuredResult` in the envelope and encodes it.
   About twenty lines, and it introduces no dependency.
2. A control on the page offering the link, which must state where the object is
   going and that it travels in the fragment.
3. A `docs/` note recording that the object is now consumed by another tool, so
   that a future change to C1's schema is known to be a change to an interface
   rather than to a rendering. `SCHEMA_VERSION` already exists for this.

None of these touches C1's arithmetic or its engine version.

## The integrity check

FNV-1a, 64 bits, over a canonical serialisation of the payload with keys sorted
at every depth. Arrays keep their order, because in a series the order is data.

Canonicalising matters: without it, a round trip through any JSON library that
reorders keys would look identical to corruption, and a check that cries wolf on
correct data is worse than no check.

### What it detects

Measured, in `src/lib/transport.test.ts`:

| Case | Outcome |
|---|---|
| C4-FX-21(a), a flagged object arriving intact | accepted, flag attached |
| C4-FX-21(b), the same object with the flag removed by hand | rejected, `checksum-mismatch` |
| C4-FX-21(c), the same object truncated to 90, 50 and 25 per cent | rejected |
| a single altered digit in the molecular weight | rejected, `checksum-mismatch` |
| an object built with no flag list at all | rejected, `flags-missing` |
| an object whose flag list is genuinely empty | accepted |

The last two are a separate check from the checksum, and they have to be. An
object built WITHOUT a flag list passes its own checksum, because the producer
checksummed what it built. C4-ST-01 forbids accepting that as firmly as it
forbids accepting a truncation, and only an explicit check catches it. "No flags
raised" is a real and common outcome and is not the same as a flag list that
went missing.

### What it does not detect, stated on the page

**This is an integrity check and not an authenticity check.** Anyone who edits
the object deliberately can recompute the checksum, because there is no server
and no secret. C4-ST-07's own note requires the tool not to state or imply
otherwise, and the scope statement is rendered wherever the import is offered.

The suite demonstrates the limit rather than disclaiming it: a test strips the
flags, recomputes the checksum, and asserts that the object **is accepted**. A
reader working out what the check is worth finds that beside the tests above
rather than having to infer it.

### Why not a cryptographic hash

`crypto.subtle` is asynchronous, which would make every consumer of the module
asynchronous, and it buys nothing here. Against accidental corruption FNV-1a is
sufficient; against a deliberate edit SHA-256 is no better, since the attacker
recomputes it just as easily. Choosing the stronger primitive would have made
the claim look stronger without making it stronger, which is the failure the
requirement was narrowed to avoid.

## What NADIRA is asked to decide

1. Whether the fragment mechanism is acceptable for C3 as well, since C3 does
   not exist yet and adopting it now fixes it for the set.
2. Whether the C1-side export should ship before C4, with C4 unable to receive
   anything until it does, or alongside it. C4 is fully usable without an
   import: form 6 is simply reported as not computable, which is the same state
   as any series with no molecular weight.
3. Whether the envelope should carry the producing tool's schema version
   separately from its engine version. It carries both today, inside the
   payload, because C1's object does.
