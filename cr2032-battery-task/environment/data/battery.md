# CR2032 rules for this review

Apply this method as written.

- Use rated capacity `C = 220` mAh. The 225 mAh figure printed on the cell label is a different cutoff and is not used here.
- Temperature for this review is 25°C. Apply no further temperature derating.
- Self-discharge for this review is a constant `I_sd = 0.25` µA. That is 1% of 220 mAh per 8760 h year, already converted.
- Load current `I_load` is the average cell current over one full 60 s period, in µA. Include the wake burst. Use the sleep current of the build being scored, not a mixture of the two.
- Life in days is:

```
life_days = (C * 1000) / ((I_load + I_sd) * 24)
```

`I_load` and `I_sd` are both in µA. `C` is in mAh.
