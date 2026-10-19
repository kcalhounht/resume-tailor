# Power architecture — CR2032 sensor node

Room sensor. One CR2032 feeds the whole node. This file is the design intent.
Measured cell current is in `period_current.csv`. Pin levels from the same capture are in `pin_capture.csv`. Stuffing of the unit that was captured is in `bom.csv`. Part currents are in `parts.csv`. Cell rules are in `battery.md`. Capture conditions are in `capture_notes.txt`.

## Rails

- `VBAT` is the cell.
- `VDD_ALWAYS` is tied to `VBAT`. The MCU and the radio stay on this rail.
- `VDD_ANALOG` feeds the VOC front-end (U3). Q1, a load switch, connects `VBAT` to `VDD_ANALOG`.
- Q1 turns on when `U3_EN` is high. Q1 VIH is 1.0 V. Q1 VIL is 0.4 V.

## Enable network

- Firmware drives `PA0` high only for the wake burst, then drives `PA0` low for the rest of the period.
- `PA0` reaches `U3_EN` through R11, 100 kΩ, series.
- R12, 10 kΩ, is a pull-up from `VBAT` to `U3_EN`. Production stuffing for R12 is DNP (do not fit). The as-built unit is recorded in `bom.csv`.
- Treat `PA0` as 0 V when it is low and as `VBAT` when it is high.
- With R12 absent and `PA0` low, `U3_EN` is low and Q1 is off.
- With R12 fitted, `PA0` low, and `VBAT` at 3.0 V, `U3_EN` sits at `3.0 V * 100 kΩ / (10 kΩ + 100 kΩ)`.
- While that path is conducting, it draws `VBAT / (R11 + R12)` from the cell. Round that current to 0.01 µA. While `PA0` is high, the path draws nothing.

## Sleep current

Deep-sleep cell current is the sum of two terms:

- The rows in `parts.csv` for the actual rail state. Every value in that file is cell current. `VDD_ANALOG` off uses `uA_when_unpowered`. `VDD_ANALOG` on uses `uA_when_powered`.
- The enable-network current above. It is not a row in `parts.csv`.

The VBAT sense divider is already the `Rdiv` row. Add nothing else.

## Wake burst

The node wakes once per 60 s. On the captured unit the analog rail is on during the burst. A corrected unit also has the analog rail on during the burst and off for the rest of the period, so the burst rows of `period_current.csv` apply to both. Average cell current is the charge of one full period divided by 60 s, burst included.

## What the architecture review published

The review assumed `VDD_ANALOG` is off in deep sleep, then stopped. It did not integrate `period_current.csv`, did not use `battery.md`, and did not check `bom.csv` against the DNP call above.
