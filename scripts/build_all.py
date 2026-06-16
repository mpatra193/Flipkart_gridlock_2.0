from __future__ import annotations

import subprocess
import sys
from pathlib import Path

STAGES = [
    "01_preprocess.py",
    "02_build_memory.py",
    "03_compute_esi.py",
    "04_train_duration.py",
    "05_build_graph.py",
]


def main():
    here = Path(__file__).resolve().parent
    for stage in STAGES:
        print(f"\n>>> running {stage}")
        subprocess.run([sys.executable, str(here / stage)], check=True)
    print("\nAll pipeline stages complete.")


if __name__ == "__main__":
    main()
