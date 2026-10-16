# Parity results

Both engines write their own section between their markers. Targets from SPEC "Parity" must match within 5 percent.

<!-- web:begin -->
## web (three.js build)

Run: `node web/tools/parity.mjs` (Node v26.5.0, Rapier 0.21.0, 120 Hz, flat plate). Updated 2026-10-16 00:44 UTC.

| Metric | Target | Web |
|---|---|---|
| 0-60 mph, motors | 1.9 s | 1.95 s |
| 0-60 mph, boost (W + Shift) | 1.1 s | 1.12 s |
| 0-88 mph, motors | (report) | 2.91 s |
| 0-88 mph, boost | (report) | 1.65 s |
| 60-0 mph, tyres (S) | about 32 m | 31.8 m (peak 1.46 g) |
| 60-0 mph, tyres + retro (S + Shift) | shorter | 18.7 m (peak 2.08 g) |
| Top speed, motors (70 s) | 250 mph | 249.3 mph |
| Top speed, boost (40 s) | 250 mph | 249.4 mph |
| Hover throttle, rear / front valve | (report) | 0.455 / 0.507 |
| Hover thrust / weight, thrust / max | 1.0 / (report) | 1.000 / 0.478 |
| Hop apex, 0.3 s Space (COM rise) | (report) | 0.30 m |
| Turn radius, 60 mph full lock | (report) | 66.9 m at 59.7 mph, 1.08 g lateral |
| Hover yaw rate, A held | 70 deg/s (assist) | 69.7 deg/s |

Method: car settles 1.2 s at rest. 0-X: full W (plus Shift) from rest, time until forward speed crosses X. 60-0: accelerate to 63 mph, then S (plus Shift), distance from the moment speed drops through 60 mph to standstill. Hover: Space 1.4 s (enters hover after `hover_engage_s`), release, 6 s altitude hold, average over 2 s. Hop: Space held 0.3 s from rest, apex of COM rise. Turn: hold 60 mph with a throttle P-controller and full A for 8 s, average R = v / yaw rate over 3 s. Yaw: hovering, A held 2.5 s, average over 2 s.

Model notes (so the Godot build can match): suspension force F = k x + c v (bump/rebound) + ARB k (x_l - x_r) + bump stop past `travel` (compression from free length); tyre combined slip s = hypot(kappa/peak_ratio, alpha/peak_angle), F = mu N f(s), f = s(2 - s) for s <= 1, f = fall + (1 - fall) / (1 + (1.5 (s - 1))^2) beyond, fall blended long/lat by slip direction; mu scaled by 1 - load_sensitivity (N/N0 - 1), N0 = m g / 4; slip ratio denominator max(|v|, 3 m/s); slip angle atan2(v_lat, max(|v_long|, 2)) with relaxation rate (|v| + 4) / relaxation_length; wheel spin integrated implicitly (4 substeps, `wheels.inertia_each`); drive force per axle is capped by the predicted tyre force at slip ratio `traction_control` (plus wheel spin-up inertia), the excess goes to the other axle, and a per-wheel slip governor trims torque above the cap; regen `regen_force` when off throttle; brakes split by `brake_front_share`. Thrust: allocator solves per-nozzle vectors (gimbal sector + magnitude) for wanted force + torque about the COM.
<!-- web:end -->

<!-- godot:begin -->
## godot (Godot 4.6.2 build)

Run: `godot/tools/parity.sh` (= `Godot --headless --path godot --fixed-fps 120 --script res://tools/parity.gd`, Jolt, 120 Hz, flat plate). Updated 2026-10-15 23:49 UTC.

| Metric | Target | Godot |
|---|---|---|
| 0-60 mph, motors | 1.9 s | 1.96 s |
| 0-60 mph, boost (W + Shift) | 1.1 s | 1.13 s |
| 0-88 mph, motors | (report) | 2.92 s |
| 0-88 mph, boost | (report) | 1.66 s |
| 60-0 mph, tyres (S) | about 32 m | 31.9 m (peak 1.47 g) |
| 60-0 mph, tyres + retro (S + Shift) | shorter | 18.6 m (peak 2.08 g) |
| Top speed, motors (70 s) | 250 mph | 249.3 mph |
| Top speed, boost (40 s) | 250 mph | 249.4 mph |
| Hover throttle, rear / front valve | (report) | 0.455 / 0.506 |
| Hover thrust / weight, thrust / max | 1.0 / (report) | 1.000 / 0.478 |
| Hop apex, 0.3 s Space (COM rise) | (report) | 0.30 m |
| Turn radius, 60 mph full lock | (report) | 66.9 m at 59.7 mph, 1.08 g lateral |
| Hover yaw rate, A held | 70 deg/s (assist) | 69.7 deg/s |

Method: identical protocol to the web harness (settle 1.2 s, 0-X until forward speed crosses X, 60-0 from 63 mph measured from the 60 mph crossing, hover = Space 1.4 s then 6 s hold then 2 s average, hop = Space 0.3 s, turn = 60 mph P-loop + full A for 8 s then 3 s average, yaw = A 2.5 s in hover then 2 s average). Same car model as web/src/sim (ported to GDScript); thrust allocation is a prioritised bounded least-squares (vertical + pitch/roll first, then axial, then side deflection for yaw) instead of the web's projected-gradient solver.
<!-- godot:end -->
