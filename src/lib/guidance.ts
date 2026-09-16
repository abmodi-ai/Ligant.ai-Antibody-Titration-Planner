/**
 * What goes in each input, in the reader's words rather than the
 * specification's.
 *
 * C4-OUT-12: guidance belongs in the input control and must not be carried
 * into any displayed value. So this file is the only home for it, it is keyed
 * by the DOM `id` already on each control, and nothing in `serialise.ts` or
 * `notebookLine` imports it. A sentence that explains how to fill a field in
 * is not a property of the series that came out, and a method record that
 * quoted one back would be recording the tool's opinion as the user's
 * declaration.
 *
 * WHY THIS IS DATA AND NOT JSX. The copy is owned by the URS author, arrives
 * as a document, and is checked against that document field by field. Keeping
 * it as a keyed record means the check walks this table rather than scraping
 * a component tree, and means a field that gains a control but not its
 * guidance is a missing key rather than a silently absent paragraph.
 *
 * THESE REPLACED THE INLINE HELP PARAGRAPHS that used to sit under each
 * control. Prose under every input made the column long enough that the
 * guidance was scrolled past rather than read, which is the failure mode
 * that motivated moving it behind a trigger. Short unit hints stay inline
 * where they are a few words; anything longer is here.
 *
 * Apostrophes are typographic (U+2019) throughout, matching the rest of the
 * page's prose; the source document uses the ASCII form. That is the only
 * departure from it.
 */

/**
 * Keyed by the `id` attribute of the control each entry explains, so the
 * trigger, the `aria-describedby` wiring and the acceptance check all agree
 * on what "the field" is without a second mapping table.
 */
export const FIELD_GUIDANCE: Readonly<Record<string, string>> = {
  /* ---------------- 1. antibody stock ---------------- */
  'stock-kind':
    'Choose "not stated by the vendor" when the vial or datasheet gives only a number of tests, with no concentration. The series will then be given in volume and dilution factor only, and every mass and molar form will be reported as not computable rather than estimated.',
  'stock-value':
    'The concentration of the antibody as supplied, transcribed from the vial or the certificate. Nothing is pre-filled and nothing is inferred from a clone or catalogue number. If the vial gives a range, enter the value you will calculate from.',
  'stock-unit':
    'Select the unit printed on the vial. The tool never infers a unit from the size of the number.',
  'stock-mass-basis':
    'Most datasheets for a fluorochrome conjugate quote the concentration of the antibody protein; a few quote the whole conjugate. The number looks identical either way. This only matters when a molecular weight is brought in to compute a molar concentration, and there it can be wrong by more than a factor of two. Choose "conjugate" only if the datasheet says the concentration includes the label.',
  'stock-source':
    'The source of the number you just entered. "Not recorded" is an accepted answer and will appear on the output, so that a reader can see the concentration could not be traced rather than assuming it was.',

  /* ---------------- 2. vendor recommendation ---------------- */
  'vendor-basis':
    'A "test" is defined by the vendor, not by a standard. Most datasheets mean one million cells in 100 µL, but some give an amount per test without saying the volume, and the number looks the same in every case. Tell the tool which case applies so it knows whether the recommendation can be carried to your own volume. Entering a recommendation is optional; a series anchored on a top point you chose is a legitimate design.',
  'vendor-amount':
    'The amount the vendor recommends for one test, exactly as the datasheet states it, whether that is a volume or a mass.',
  'vendor-test-volume':
    'The volume the vendor’s test is performed in, if the datasheet states it. If it does not, go back and choose "test volume not stated" above rather than guessing.',
  'vendor-cells-kind':
    'Whether the datasheet says how many cells the recommendation was determined on. If it does not, choose "not stated". Depletion of antibody by the cells depends on this number, so a recommendation may not transfer at a different cell count even at the same concentration.',
  'vendor-cells':
    'The cell number the vendor’s recommendation was determined at, as stated on the datasheet. This is the vendor’s figure, not yours. Yours goes in the next panel.',

  /* ---------------- 3. staining context ---------------- */
  'staining-volume':
    'The final volume of the stain, including the antibody and every other reagent added. This is the single most load-bearing number in the tool: whether 100 µL means the volume the antibody goes into, or the volume after it is added, changes every concentration below.',
  'staining-volume-unit':
    'Select the unit you measure in. The tool converts once, on entry, and reports in the units you chose.',
  'cell-number':
    'The number of cells in one test, at your own protocol. The tool records this and shows the cell density it implies. It does not adjust the concentrations for antibody depletion, and it cannot tell you whether depletion matters at your antigen density.',
  'pipetting-minimum':
    'The smallest volume your pipette delivers reliably, which depends on the pipette and on you: a P2 in its calibrated range and a P10 at its lower bound are not the same. No single value has a defensible basis, so the tool does not impose one. 2 µL is offered as a starting point. Any point of the series below whatever you enter here will be flagged as needing an intermediate dilution.',

  /* ---------------- 4. series design ---------------- */
  'top-value':
    'The most concentrated point of the series, the one everything else is diluted from. Enter the number, then say below which form you are entering it in.',
  'top-form':
    'Which quantity the number above is. These forms differ from each other by factors of your staining volume, your stock concentration and your cell number, so selecting the wrong one produces a completely different series from the same number. There is deliberately no default; choose it each time.',
  'dilution-factor':
    'How much more dilute each point is than the one before it. Defined as final volume divided by stock volume, so 1 in 100 is a factor of 100. Any factor above 1 is accepted, including 3 and non-integer values. Two-fold is common but is not a rule.',
  points:
    'How many points the series has, from 2 to 12, counting the top point as point 1.',
}

/** Every field that carries guidance, for the acceptance check to walk. */
export const GUIDED_FIELD_IDS: readonly string[] = Object.keys(FIELD_GUIDANCE)
