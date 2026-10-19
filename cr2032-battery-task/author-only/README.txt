Upload only the seven files in environment/data (or upload-data.zip).
Do not upload this author-only folder. The box must not contain the answer.

Gold (corrected build, 25°C)
  condition: R12 fitted pulls U3_EN to 2.73 V, so VDD_ANALOG stays on in sleep
  as_built_sleep_uA: 75.07
  fixed_sleep_uA: 3.0
  life_days: 1392.7

How 75.07 and 1392.7 are obtained
  Enable path, R12 fitted and PA0 low: 3.00 V / 110 kΩ = 27.27 µA
  Rail-on parts: 0.50 + 0.30 + 45.00 + 2.00 + 0.00 = 47.80 µA
  As-built plateau: 47.80 + 27.27 = 75.07 µA, which is the last row of the capture
  Burst charge = 20 ms * 8000 µA + 10 ms * 4000 µA = 200000 µA·ms
  Fixed sleep, R12 removed and rail off: 0.50 + 0.30 + 0 + 2.00 + 0.20 = 3.00 µA
  I_load = (200000 + 59970 * 3) / 60000 = 6.331833 µA
  I_sd = 0.25 µA
  life_days = (220 * 1000) / ((6.331833 + 0.25) * 24) = 1392.72

Checks an engineer can defend
  condition mentions R12 and that it is fitted (or populated)
  as_built_sleep_uA in (74.9, 75.3)
  fixed_sleep_uA in (2.9, 3.1)
  life_days in (1360, 1420)

What those ranges reject
  naive_a: never opens the capture; copies the review. Sleep plateau and life both miss.
  naive_b: right cause, reports the as-built life (116.6 days) instead of the corrected life.
  Parts sum only, forgetting the 27.27 µA enable path -> 47.8 µA, outside the plateau range.
  225 mAh label capacity -> 1424 days, outside the life range.
  Dropping self-discharge -> 1448 days, outside the life range.
