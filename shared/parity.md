# Parity results

Both engines write their own section between their markers. Targets from SPEC "Parity" must match within 5 percent.

<!-- web:begin -->
## web (three.js build)

Run: `node web/tools/parity.mjs` (Node v26.5.0, Rapier 0.21.0, 120 Hz, flat plate). Updated 2026-10-16 17:59 UTC.

| Metric | Target | Web |
|---|---|---|
| 0-60 mph, motors | 1.9 s | 1.92 s |
| 0-60 mph, boost (W + Shift) | 1.1 s | 1.11 s |
| 0-88 mph, motors | (report) | 2.87 s |
| 0-88 mph, boost | (report) | 1.63 s |
| 60-0 mph, tyres (S) | about 32 m | 21.8 m (peak 1.80 g) |
| 60-0 mph, tyres + retro (S + Shift) | shorter | 15.2 m (peak 2.64 g) |
| Top speed, motors (70 s) | 250 mph | 249.3 mph |
| Top speed, boost (40 s) | 250 mph | 249.4 mph |
| Hover throttle, rear / front / side valve | (report) | 0.364 / 0.373 / 0.245 |
| Hover thrust / weight, thrust / max | 1.0 / (report) | 1.000 / 0.330 |
| Hop apex, 0.3 s Space (COM rise) | (report) | 0.46 m |
| Turn radius, 60 mph full lock | (report) | 54.0 m at 59.4 mph, 1.33 g lateral |
| Hover yaw rate, A held | 70 deg/s (assist) | 69.7 deg/s |

Method: car settles 1.2 s at rest. 0-X: full W (plus Shift) from rest, time until forward speed crosses X. 60-0: accelerate to 63 mph, then S (plus Shift), distance from the moment speed drops through 60 mph to standstill. Hover: Space 1.4 s (enters hover after `hover_engage_s`), release, 6 s altitude hold, average over 2 s. Hop: Space held 0.3 s from rest, apex of COM rise. Turn: hold 60 mph with a throttle P-controller and full A for 8 s, average R = v / yaw rate over 3 s. Yaw: hovering, A held 2.5 s, average over 2 s.

Model notes (so the Godot build can match): suspension force F = k x + c v (bump/rebound) + ARB k (x_l - x_r) + bump stop past `travel` (compression from free length); tyre combined slip s = hypot(kappa/peak_ratio, alpha/peak_angle), F = mu N f(s), f = s(2 - s) for s <= 1, f = fall + (1 - fall) / (1 + (1.5 (s - 1))^2) beyond, fall blended long/lat by slip direction; mu scaled by 1 - load_sensitivity (N/N0 - 1), N0 = m g / 4; slip ratio denominator max(|v|, 3 m/s); slip angle atan2(v_lat, max(|v_long|, 2)) with relaxation rate (|v| + 4) / relaxation_length; wheel spin integrated implicitly (4 substeps, `wheels.inertia_each`); drive force per axle is capped by the predicted tyre force at slip ratio `traction_control` (plus wheel spin-up inertia), the excess goes to the other axle, and a per-wheel slip governor trims torque above the cap; regen `regen_force` when off throttle; brakes split by `brake_front_share`. Thrust: allocator solves per-nozzle vectors (gimbal sector + magnitude) for wanted force + torque about the COM.
<!-- web:end -->

<!-- godot:begin -->
## godot (Godot 4.6.2 build)

Run: `godot/tools/parity.sh` (= `Godot --headless --path godot --fixed-fps 120 --script res://tools/parity.gd`, Jolt, 120 Hz, flat plate). Updated 2026-10-16 18:02 UTC.

| Metric | Target | Godot |
|---|---|---|
| 0-60 mph, motors | 1.9 s | 1.93 s |
| 0-60 mph, boost (W + Shift) | 1.1 s | 1.12 s |
| 0-88 mph, motors | (report) | 2.88 s |
| 0-88 mph, boost | (report) | 1.64 s |
| 60-0 mph, tyres (S) | about 32 m | 22.0 m (peak 1.80 g) |
| 60-0 mph, tyres + retro (S + Shift) | shorter | 15.4 m (peak 2.66 g) |
| Top speed, motors (70 s) | 250 mph | 249.3 mph |
| Top speed, boost (40 s) | 250 mph | 249.4 mph |
| Hover throttle, rear / front / side valve | (report) | 0.364 / 0.372 / 0.245 |
| Hover thrust / weight, thrust / max | 1.0 / (report) | 1.000 / 0.330 |
| Hop apex, 0.3 s Space (COM rise) | (report) | 0.46 m |
| Turn radius, 60 mph full lock | (report) | 54.0 m at 59.4 mph, 1.33 g lateral |
| Hover yaw rate, A held | 70 deg/s (assist) | 69.7 deg/s |

Method: identical protocol to the web harness (settle 1.2 s, 0-X until forward speed crosses X, 60-0 from 63 mph measured from the 60 mph crossing, hover = Space 1.4 s then 6 s hold then 2 s average, hop = Space 0.3 s, turn = 60 mph P-loop + full A for 8 s then 3 s average, yaw = A 2.5 s in hover then 2 s average). Same car model as web/src/sim ported to GDScript (suspension, combined-slip tyres with 4-substep implicit wheel spin, TC/ABS, regen, aero, flight computer modes and the same warm-started accelerated projected-gradient thrust allocator), so the numbers track the web build within about 1 percent.
<!-- godot:end -->
