1. Start with the pin capture. PA0 is low the whole time the part is asleep, but U3_EN and VDD_ANALOG are still high.
2. Then the BOM. Production says leave R12 off the board, and unit A4 came back with it fitted.
3. Work the divider with PA0 at 0 V. U3_EN ends up at 2.73 V, which is enough to hold the load switch on.
4. That path draws current too. 3.0 V across 110 kΩ is 27.27 µA, on top of 47.80 µA from the parts that are still powered.
5. 47.80 plus 27.27 is 75.07 µA. Same number as the sleep row in the current capture, so the log and the parts agree.
6. Pull R12. The analog rail drops out, the enable path goes to nothing, and sleep current falls to the off-state sum, 3.00 µA.
7. Leave the burst alone. 20 ms at 8000 µA, 10 ms at 4000 µA, then the other 59970 ms at 3 µA.
8. Life from the battery note, as written. 220 mAh, add the 0.25 µA self-discharge, and that comes out to 1392.7 days.
