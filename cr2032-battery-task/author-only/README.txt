Upload only the seven files in environment/data (or upload-data.zip).
Do not upload this author-only folder. The box must not contain the answer.

Gold (corrected build, 25°C)
  condition: R12 fitted pulls U3_EN to 2.73 V, so VDD_ANALOG stays on in sleep
  as_built_sleep_uA: 47.8
  fixed_sleep_uA: 3.0
  life_days: 1392.7

How 1392.7 is obtained
  Burst charge = 20 ms * 8000 µA + 10 ms * 4000 µA = 200000 µA·ms
  Fixed sleep = 0.50 + 0.30 + 0 + 2.00 + 0.20 = 3.00 µA over 59970 ms
  I_load = (200000 + 59970 * 3) / 60000 = 6.331833 µA
  I_sd = 0.25 µA
  life_days = (220 * 1000) / ((6.331833 + 0.25) * 24) = 1392.72

Checks an engineer can defend
  condition mentions R12 and that it is fitted (or populated)
  as_built_sleep_uA in (47.6, 48.0)
  fixed_sleep_uA in (2.9, 3.1)
  life_days in (1360, 1420)

What those ranges reject
  naive_a: never opens the capture; copies the review. Sleep plateau and life both miss.
  naive_b: right cause, reports the as-built life (178.5 days) instead of the corrected life.
  225 mAh label capacity -> 1424 days, outside the life range.
  Dropping self-discharge -> 1448 days, outside the life range.
