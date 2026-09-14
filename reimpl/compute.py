"""Run the reimplementation over the shared fixture set and print the results.

Reads reimpl/fixtures.json, which holds INPUTS only, and writes one JSON
document to stdout. It never reads the TypeScript implementation's output: the
comparison is made afterwards, by reimpl/compare.test.ts, on the unrounded
values.

The numbers are emitted with repr(), which round trips a double exactly, so the
comparison is not degraded by this file.
"""

import json
import sys
from pathlib import Path

from titration import compute_series

fixtures = json.loads((Path(__file__).parent / "fixtures.json").read_text())

results = {}
for fixture in fixtures["fixtures"]:
    results[fixture["id"]] = compute_series(fixture["inputs"])

json.dump(results, sys.stdout, indent=2)
