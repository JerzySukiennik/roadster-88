# CarInput: one tick of driver intent (keyboard state mapped to axes), shared by the game, scenarios and the parity harness.
class_name CarInput
extends RefCounted

var throttle: float = 0.0
var brake: float = 0.0
var steer: float = 0.0
var boost: bool = false
var lift: bool = false
var descend: bool = false
var pitch: float = 0.0
var roll: float = 0.0

func clear() -> void:
	throttle = 0.0
	brake = 0.0
	steer = 0.0
	boost = false
	lift = false
	descend = false
	pitch = 0.0
	roll = 0.0

func copy_from(o: CarInput) -> void:
	throttle = o.throttle
	brake = o.brake
	steer = o.steer
	boost = o.boost
	lift = o.lift
	descend = o.descend
	pitch = o.pitch
	roll = o.roll

func any_active() -> bool:
	return throttle > 0.0 or brake > 0.0 or absf(steer) > 0.0 or boost or lift or descend or absf(pitch) > 0.0 or absf(roll) > 0.0
