"""
An independent reimplementation of the C4 titration engine, in Python.

URS acceptance 3: "An independent reimplementation in a second language agrees
with the shipped implementation on the full fixture set, compared on the
UNROUNDED structured values within the derived tolerance. Code review does not
satisfy this test."

WHAT INDEPENDENCE MEANS HERE, stated plainly rather than implied. This is
written from the URS relations, not from src/lib: the module below reads
sections 4, 5 and 6 of the specification and implements them in Python's own
idiom. It is not a translation, and it does not import, mirror or consult the
TypeScript at any point. What it is not is a reimplementation by a second
PERSON, and that is a real limitation of this artefact rather than a technical
one: the same reader who implemented the engine implemented this, so a
misreading of the specification common to both would survive. That is what the
hand calculations of C4-FX-01 and the reference table of acceptance 1 exist to
catch, and they are checked separately.

WHAT IS COMPARED is the unrounded value of every reported quantity, per
C4-UN-07. Displayed values are not compared, because correctness must not
depend on a formatting choice, and because the two languages round differently
by default: Python's `round` is half-to-even and C4-UN-09 is half away from
zero. The rounding rule is stated to this implementation rather than discovered
by it, and nothing below depends on it.

THE GENERATION METHOD IS THE STATED ONE, per C4-IV-06. Exponentiation by
squaring on the integer index, then one division. `math.pow` and `**` are not
used for the series, because neither is required to be correctly rounded in the
same way in both languages, and the derived ratio tolerance is defined over the
stated method and no other.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# URS section 4. The only place a magnitude relationship between units is
# written down in this implementation.
VOLUME_TO_UL = {"uL": 1.0, "mL": 1000.0}
CONCENTRATION_TO_UG_PER_ML = {"mg/mL": 1000.0, "ug/mL": 1.0, "ng/mL": 1e-3}
CELLS_TO_COUNT = {"cells": 1.0, "cells-1e6": 1e6}

# URS section 8, the reportable pairs table, in the order it is written. Rows
# are evaluated in order and the first match supplies the verdict.
REPORTABLE_PAIRS = [
    ("assembled", "antibody-protein", True),
    ("conjugate", "conjugate", True),
    ("monomer", None, False),
    (None, "not-recorded", False),
    ("not-recorded", None, False),
    ("assembled", "conjugate", False),
    ("conjugate", "antibody-protein", False),
]


def form_six_reported(imported_basis: str, stock_basis: str) -> bool:
    for wanted_imported, wanted_stock, reported in REPORTABLE_PAIRS:
        if wanted_imported is not None and wanted_imported != imported_basis:
            continue
        if wanted_stock is not None and wanted_stock != stock_basis:
            continue
        return reported
    return False


def integer_power(base: float, exponent: int) -> float:
    """`base` to a non-negative integer power, by exponentiation by squaring.

    A fixed sequence of correctly rounded multiplications, which is what makes
    the series identical across engines and languages. Python's `**` on floats
    defers to the platform `pow` and is not required to be correctly rounded,
    so it is not used.
    """
    if exponent < 0:
        raise ValueError("the exponent is an index and cannot be negative")
    result = 1.0
    square = base
    remaining = exponent
    while remaining > 0:
        if remaining % 2 == 1:
            result *= square
        remaining //= 2
        if remaining > 0:
            square *= square
    return result


@dataclass
class Normalised:
    """Every declaration in base units, and the folded constants.

    URS C4-UN-04 requires conversion to be exact within floating point with no
    rounding before final display, and C4-IV-04 compares the microlitre path
    against the millilitre path. Each quantity is therefore multiplied by
    exactly one factor, once, and the per-form constants are folded so that no
    reported value is normalised twice.
    """

    stock_ug_per_ml: float | None
    staining_volume_ul: float
    cells: float
    volume_per_concentration: float | None
    mass_per_concentration: float
    mass_per_1e6_cells_per_concentration: float | None
    molar_per_concentration: float | None
    cells_per_ul: float


def normalise(inputs: dict[str, Any]) -> Normalised:
    stock = inputs["stock"]
    if stock["kind"] == "stated":
        stock_ug_per_ml = (
            stock["concentration"]["value"]
            * CONCENTRATION_TO_UG_PER_ML[stock["concentration"]["unit"]]
        )
    else:
        stock_ug_per_ml = None

    staining_volume_ul = (
        inputs["stainingVolume"]["value"] * VOLUME_TO_UL[inputs["stainingVolume"]["unit"]]
    )
    cells = inputs["cellNumber"]["value"] * CELLS_TO_COUNT[inputs["cellNumber"]["unit"]]

    # A concentration in ug/mL times the staining volume in mL is a mass in ug.
    mass_per_concentration = staining_volume_ul / 1000.0

    imported = inputs.get("imported")

    return Normalised(
        stock_ug_per_ml=stock_ug_per_ml,
        staining_volume_ul=staining_volume_ul,
        cells=cells,
        volume_per_concentration=(
            None if stock_ug_per_ml is None else staining_volume_ul / stock_ug_per_ml
        ),
        mass_per_concentration=mass_per_concentration,
        mass_per_1e6_cells_per_concentration=(
            (mass_per_concentration * 1e6) / cells if cells > 0 else None
        ),
        # ug/mL is mg/L, so the factor to g/L is 1e-3.
        molar_per_concentration=(None if imported is None else 1e-3 / imported["gPerMol"]),
        cells_per_ul=cells / staining_volume_ul,
    )


def anchor(inputs: dict[str, Any], base: Normalised) -> tuple[str, float]:
    """The top point, converted to what the series is generated from.

    C4-DT-03 anchors on concentration in the staining volume and derives the
    volume per test from it. Under C4-AB-03 there is no concentration to anchor
    on, and the series is volumetric instead.
    """
    top = inputs["topPoint"]
    form = top["form"]

    if inputs["stock"]["kind"] != "stated":
        if form == 1:
            return ("volume", top["value"]["value"] * VOLUME_TO_UL[top["value"]["unit"]])
        if form == 4:
            # C4-UN-08: the factor is final over stock, so the stock volume is
            # the staining volume divided by it.
            return ("volume", base.staining_volume_ul / top["value"])
        raise ValueError("without a stock concentration only forms 1 and 4 are computable")

    if form == 1:
        ul = top["value"]["value"] * VOLUME_TO_UL[top["value"]["unit"]]
        return ("concentration", ul / base.volume_per_concentration)
    if form == 2:
        return ("concentration", top["value"] / base.mass_per_concentration)
    if form == 3:
        return (
            "concentration",
            top["value"]["value"] * CONCENTRATION_TO_UG_PER_ML[top["value"]["unit"]],
        )
    if form == 4:
        return ("concentration", base.stock_ug_per_ml / top["value"])
    if form == 5:
        return ("concentration", top["value"] / base.mass_per_1e6_cells_per_concentration)
    raise ValueError(f"form {form} is not an accepted entry form")


def forms_at_concentration(
    concentration: float, base: Normalised, form_six: bool
) -> dict[str, float | None]:
    """The six forms of C4-UN-05, each from the point's concentration.

    Every form except the dilution factor is the concentration multiplied by one
    folded constant. The dilution factor is the ratio of the two concentrations,
    reached without going through a volume so that it does not inherit form 1's
    rounding.
    """
    return {
        "1": (
            None
            if base.volume_per_concentration is None
            else concentration * base.volume_per_concentration
        ),
        "2": concentration * base.mass_per_concentration,
        "3": concentration,
        "4": None if base.stock_ug_per_ml is None else base.stock_ug_per_ml / concentration,
        "5": (
            None
            if base.mass_per_1e6_cells_per_concentration is None
            else concentration * base.mass_per_1e6_cells_per_concentration
        ),
        "6": (
            concentration * base.molar_per_concentration
            if form_six and base.molar_per_concentration is not None
            else None
        ),
    }


def forms_at_volume(volume_ul: float, base: Normalised) -> dict[str, float | None]:
    """The C4-AB-03 case: forms 1 and 4 only, both volumetric."""
    return {
        "1": volume_ul,
        "2": None,
        "3": None,
        "4": base.staining_volume_ul / volume_ul,
        "5": None,
        "6": None,
    }


def compute_series(inputs: dict[str, Any]) -> dict[str, Any]:
    """The whole determination, unrounded."""
    base = normalise(inputs)

    imported = inputs.get("imported")
    stock = inputs["stock"]
    form_six = False
    if imported is not None and stock["kind"] == "stated":
        form_six = form_six_reported(imported["massBasis"], stock["massBasis"])

    kind, top = anchor(inputs, base)
    factor = inputs["dilutionFactor"]

    points = []
    for index in range(1, inputs["points"] + 1):
        # C4-IV-06: one division by the exact integer power, never a running
        # product, so no point inherits another point's rounding.
        value = top / integer_power(factor, index - 1)
        forms = (
            forms_at_concentration(value, base, form_six)
            if kind == "concentration"
            else forms_at_volume(value, base)
        )
        points.append({"index": index, "forms": forms})

    return {
        "anchor": {"basis": kind, "value": top},
        "cellDensity": base.cells_per_ul,
        "points": points,
    }
