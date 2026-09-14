/**
 * Section 7: the conditions under which no series is produced at all.
 *
 * A rejection is not a flag and the two are never merged. A flag never blocks
 * the determination and always accompanies a result; a rejection means the
 * inputs describe something that cannot exist, and there is nothing to report.
 *
 * EVERY MESSAGE NAMES THE QUANTITY AND THE PHYSICAL REASON. Section 7 says so
 * in terms: "Generic validation errors do not satisfy this section." A message
 * reading "invalid input" tells a user at a bench nothing they can act on, and
 * the reason a stain cannot occur in zero volume is not a fact about this
 * software.
 *
 * ON COLOUR, since this decides how these render: a rejection is shown on the
 * offending field with the amber rule the flags use, NOT the error rule. Red in
 * this palette means the tool itself failed. A user who typed a negative cell
 * count has not broken anything, and telling them they have is both wrong and
 * unhelpful.
 */

import { MAX_POINTS, MIN_POINTS, type SeriesInputs } from './normalise'
import { UNIT_LABEL } from './units'
import { formatSigFigs } from './format'

export type RejectionCode =
  | 'C4-HI-01'
  | 'C4-HI-02'
  | 'C4-HI-03'
  | 'C4-HI-04'
  | 'C4-HI-05'
  | 'C4-HI-06'
  | 'C4-HI-07'

export interface Rejection {
  code: RejectionCode
  /** Which input the message should be shown against. */
  field:
    | 'stock-concentration'
    | 'staining-volume'
    | 'cell-number'
    | 'dilution-factor'
    | 'points'
    | 'pipetting-minimum'
    | 'top-point'
  message: string
}

/**
 * The conditions that can be judged from the declarations alone.
 *
 * C4-HI-06 is not among them: it is a statement about the computed system and
 * is evaluated once the series exists, by `rejectSeries` below.
 */
export function rejectInputs(inputs: SeriesInputs): Rejection[] {
  const rejections: Rejection[] = []

  if (inputs.stock.kind === 'stated') {
    const { value, unit } = inputs.stock.concentration
    if (!(value > 0)) {
      rejections.push({
        code: 'C4-HI-01',
        field: 'stock-concentration',
        message: `The stock concentration is ${formatSigFigs(value)} ${UNIT_LABEL[unit]}. A concentration cannot be zero or negative: a solution with none of the antibody in it cannot be diluted to reach any point of a series.`,
      })
    }
  }

  const stain = inputs.stainingVolume
  if (!(stain.value > 0)) {
    rejections.push({
      code: 'C4-HI-02',
      field: 'staining-volume',
      message: `The staining volume is ${formatSigFigs(stain.value)} ${UNIT_LABEL[stain.unit]}. A stain cannot occur in zero volume: there would be nothing for the cells to be suspended in and no volume for a concentration to be defined over.`,
    })
  }

  const cells = inputs.cellNumber
  if (cells.value < 0) {
    rejections.push({
      code: 'C4-HI-03',
      field: 'cell-number',
      message: `The cell number is ${formatSigFigs(cells.value)} ${UNIT_LABEL[cells.unit]}. A count of cells cannot be negative. Zero is accepted and describes a no-cell control condition.`,
    })
  }

  if (!(inputs.dilutionFactor > 1)) {
    rejections.push({
      code: 'C4-HI-04',
      field: 'dilution-factor',
      message: `The dilution factor is ${formatSigFigs(inputs.dilutionFactor)}. A titration series must decrease in concentration, so each step must divide by more than one. A factor of exactly 1 repeats the top point; a factor below 1 would concentrate the antibody at every step.`,
    })
  }

  const points = inputs.points
  if (!Number.isInteger(points) || points < MIN_POINTS || points > MAX_POINTS) {
    rejections.push({
      code: 'C4-HI-05',
      field: 'points',
      message: `The number of points is ${points}. A series must have a whole number of points, at least ${MIN_POINTS} so that there is something to compare, and at most ${MAX_POINTS} so that the whole series is legible on one screen.`,
    })
  }

  const minimum = inputs.pipettingMinimum.value
  if (!(minimum > 0)) {
    rejections.push({
      code: 'C4-HI-07',
      field: 'pipetting-minimum',
      message: `The declared minimum reliable pipetting volume is ${formatSigFigs(minimum)} µL. A volume cannot be zero or negative, and no pipette delivers nothing reliably.`,
    })
  }

  return rejections
}

/**
 * C4-HI-06, evaluated against the computed system.
 *
 * Since the series descends, only the top point can trigger this. The condition
 * is nonetheless stated against every point, so that it is caught wherever it
 * arises rather than wherever it was expected to.
 *
 * Equality is rejected, not merely excess: a stain composed entirely of stock
 * has no cells, no buffer and no other reagent in it, so it is not a stain.
 */
export function rejectSeries(
  concentrations: readonly (number | null)[],
  volumesUl: readonly (number | null)[],
  stockUgPerMl: number | null,
  stainingVolumeUl: number,
): Rejection[] {
  const rejections: Rejection[] = []

  for (let i = 0; i < concentrations.length; i += 1) {
    const c = concentrations[i]
    const v = volumesUl[i]
    const index = i + 1

    const tooConcentrated = stockUgPerMl !== null && c !== null && c >= stockUgPerMl
    const tooLarge = v !== null && v >= stainingVolumeUl

    if (!tooConcentrated && !tooLarge) continue

    const reached =
      stockUgPerMl !== null && c !== null
        ? `Point ${index} asks for ${formatSigFigs(c)} µg/mL in the staining volume, from a stock of ${formatSigFigs(stockUgPerMl)} µg/mL.`
        : `Point ${index} would need ${formatSigFigs(v as number)} µL of stock in a staining volume of ${formatSigFigs(stainingVolumeUl)} µL.`

    rejections.push({
      code: 'C4-HI-06',
      field: 'top-point',
      message: `${reached} This point cannot be reached from this stock, because the stock is not more concentrated than the target. Reaching it would take at least the whole staining volume of undiluted stock, leaving no room for the cells, the buffer or anything else in the tube.`,
    })
    // One point is enough to say it. A descending series that fails here fails
    // at the top, and repeating the same sentence per point would bury it.
    break
  }

  return rejections
}
