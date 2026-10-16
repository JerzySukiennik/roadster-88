# CarAudio: catalog-driven one-shots and loops (missing keys stay silent) plus the EV motor synthesized at startup (whine, gear-reduction harmonics, hum, inverter noise, regen) and thrust hiss, pitch- and gain-tracked live from motor rpm, load and nozzle thrust.
extends Node

const MIX := 32000.0
const MPH := 0.44704

var game
var catalog: Dictionary = {}
var streams: Dictionary = {}
var loops: Dictionary = {}
var pool: Array[AudioStreamPlayer] = []
var pool3d: Array[AudioStreamPlayer3D] = []
var seed_n := 22222
var m_rpm := 0.0
var m_load := 0.0
var m_regen := 0.0
var m_thrust := 0.0
var m_boost := 0.0
var m_front := 0.0
var m_pan := 0.0
var m_gain := 1.0
var cur_rpm := 0.0
var cur_load := 0.0
var cur_regen := 0.0
var cur_thr := 0.0
var cur_boost := 0.0
var prev_thrusting := false
var prev_boost := false
var prev_deploy := 0.0
var prev_contact_v := [0.0, 0.0, 0.0, 0.0]
var flux := 0.0
var crackle_t := 0.0
var radio_on := false
var radio_era := "2026"
var muted := false

func setup(g) -> void:
	game = g
	name = "CarAudio"
	_buses()
	_load_catalog()
	for i in 14:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		pool.append(p)
	for i in 10:
		var p3 := AudioStreamPlayer3D.new()
		p3.bus = "SFX"
		p3.unit_size = 8.0
		p3.max_distance = 400.0
		p3.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		game.world3d.add_child(p3)
		pool3d.append(p3)
	for k in ["tyre_roll_loop", "tyre_skid_loop", "wind_loop", "metal_scrape_loop", "tc_flux_loop", "thrust_loop", "radio_static"]:
		_make_loop(k, "SFX")
	for e in ["hadean", "dino", "1885", "2026", "2080", "ruins", "scifi"]:
		_make_loop("music_" + e, "Music")
	_build_synth()
	if game.car:
		game.car.impacted.connect(_on_impact)
		_attach_synth(game.car)

func on_car_changed(c) -> void:
	if not c.impacted.is_connected(_on_impact):
		c.impacted.connect(_on_impact)
	_attach_synth(c)

var layers: Dictionary = {}

func _wav(samples: PackedFloat32Array, rate: int) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		var v := int(clampf(samples[i], -1.0, 1.0) * 32000.0)
		bytes.encode_s16(i * 2, v)
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = rate
	w.stereo = false
	w.data = bytes
	w.loop_mode = AudioStreamWAV.LOOP_FORWARD
	w.loop_begin = 0
	w.loop_end = samples.size()
	return w

func _tone(base: float, harmonics: Array, rate: int, secs: float) -> AudioStreamWAV:
	var n := int(rate * secs)
	var out := PackedFloat32Array()
	out.resize(n)
	var norm := 0.0
	for h in harmonics:
		norm += absf(float(h[1]))
	for i in n:
		var t := float(i) / rate
		var v := 0.0
		for h in harmonics:
			v += sin(TAU * base * float(h[0]) * t + float(h[2])) * float(h[1])
		out[i] = v / maxf(norm, 1e-3) * 0.9
	return _wav(out, rate)

func _noise(rate: int, secs: float, lp: float, hp: float) -> AudioStreamWAV:
	var n := int(rate * secs)
	var out := PackedFloat32Array()
	out.resize(n)
	var a := 0.0
	var b := 0.0
	var peak := 0.0
	for i in n:
		var x := randf() * 2.0 - 1.0
		a += (x - a) * lp
		b += (a - b) * hp
		var y := a - b
		out[i] = y
		peak = maxf(peak, absf(y))
	var fade := int(rate * 0.02)
	for i in fade:
		var k := float(i) / fade
		var j := n - fade + i
		out[j] = out[j] * (1.0 - k) + out[i] * k
	for i in n:
		out[i] = out[i] / maxf(peak, 1e-4) * 0.8
	return _wav(out, rate)

func _build_synth() -> void:
	var rate := 32000
	var specs := {
		"whine": _tone(200.0, [[1, 1.0, 0.0], [2, 0.35, 0.7], [3, 0.18, 1.3], [5, 0.08, 2.1]], rate, 1.0),
		"gear": _tone(300.0, [[1, 1.0, 0.0], [2, 0.25, 0.4], [4, 0.1, 1.9]], rate, 1.0),
		"hum": _tone(100.0, [[1, 1.0, 0.0], [2, 0.5, 0.3], [3, 0.3, 0.9], [4, 0.15, 1.7]], rate, 1.0),
		"inverter": _noise(rate, 1.5, 0.9, 0.35),
		"hiss": _noise(rate, 2.0, 0.45, 0.02),
		"rumble": _noise(rate, 2.0, 0.025, 0.002),
	}
	for k in specs.keys():
		var p := AudioStreamPlayer3D.new()
		p.stream = specs[k]
		p.bus = "Engine"
		p.unit_size = 9.0
		p.max_distance = 600.0
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		p.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_PHYSICS_STEP
		p.volume_db = -80.0
		add_child(p)
		layers[k] = {"p": p, "vol": 0.0}
	if layers.has("whine"):
		var regen := AudioStreamPlayer3D.new()
		regen.stream = specs["gear"]
		regen.bus = "Engine"
		regen.unit_size = 9.0
		regen.max_distance = 600.0
		regen.volume_db = -80.0
		add_child(regen)
		layers["regen"] = {"p": regen, "vol": 0.0}

func _attach_synth(c) -> void:
	for k in layers.keys():
		var p: AudioStreamPlayer3D = layers[k]["p"]
		if p.get_parent():
			p.get_parent().remove_child(p)
		c.add_child(p)
		p.position = Vector3(0, 0.4, -1.4) if k in ["hiss", "rumble"] else Vector3(0, 0.4, 0.4)
		if not p.playing:
			p.play(randf() * 0.9)

func _layer(k: String, vol: float, pitch: float, dt: float, rate := 10.0) -> void:
	if not layers.has(k):
		return
	var l: Dictionary = layers[k]
	l["vol"] = move_toward(l["vol"], clampf(vol, 0.0, 1.5), dt * rate)
	var p: AudioStreamPlayer3D = l["p"]
	p.volume_db = linear_to_db(maxf(l["vol"], 0.00001))
	p.pitch_scale = clampf(pitch, 0.05, 8.0)

func _buses() -> void:
	for b in ["SFX", "Music", "Engine"]:
		if AudioServer.get_bus_index(b) < 0:
			AudioServer.add_bus()
			var idx := AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, b)
			AudioServer.set_bus_send(idx, "Master")
	var mi := AudioServer.get_bus_index("Master")
	if AudioServer.get_bus_effect_count(mi) == 0:
		var lim := AudioEffectHardLimiter.new()
		lim.ceiling_db = -0.5
		AudioServer.add_bus_effect(mi, lim)
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Music"), -6.0)
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Engine"), -3.0)

func _load_catalog() -> void:
	var base := "res://ext/assets/audio/"
	var path := base + "catalog.json"
	var txt := ""
	var live := ProjectSettings.globalize_path("res://").path_join("../assets/audio/catalog.json").simplify_path()
	if FileAccess.file_exists(path):
		txt = FileAccess.get_file_as_string(path)
	elif FileAccess.file_exists(live):
		txt = FileAccess.get_file_as_string(live)
	var d: Variant = JSON.parse_string(txt) if txt != "" else null
	if not (d is Dictionary):
		return
	catalog = d
	for k in catalog.keys():
		var entry: Dictionary = catalog[k]
		var list: Array = []
		for f in entry.get("files", []):
			var fs := String(f)
			if not fs.ends_with(".ogg"):
				continue
			var s: AudioStream = null
			if ResourceLoader.exists(base + fs):
				s = load(base + fs)
			elif FileAccess.file_exists(base + fs):
				s = AudioStreamOggVorbis.load_from_file(base + fs)
			if s:
				list.append(s)
		if list.is_empty():
			for f in entry.get("files", []):
				var fs2 := String(f)
				if fs2.ends_with(".mp3") and FileAccess.file_exists(base + fs2):
					var mp := AudioStreamMP3.new()
					mp.data = FileAccess.get_file_as_bytes(base + fs2)
					list.append(mp)
		if not list.is_empty():
			streams[k] = {"list": list, "gain": float(entry.get("gain", 1.0)), "loop": bool(entry.get("loop", false))}

func _make_loop(key: String, bus: String) -> void:
	if not streams.has(key):
		return
	var s: AudioStream = streams[key]["list"][0]
	if s is AudioStreamOggVorbis:
		s = s.duplicate()
		(s as AudioStreamOggVorbis).loop = true
	elif s is AudioStreamMP3:
		s = s.duplicate()
		(s as AudioStreamMP3).loop = true
	var p := AudioStreamPlayer.new()
	p.stream = s
	p.bus = bus
	p.volume_db = -80.0
	add_child(p)
	loops[key] = {"p": p, "gain": streams[key]["gain"], "vol": 0.0}

func _loop_vol(key: String, v: float, dt: float, rate := 6.0) -> void:
	if not loops.has(key):
		return
	var l: Dictionary = loops[key]
	l["vol"] = move_toward(l["vol"], clampf(v, 0.0, 1.5), dt * rate)
	var p: AudioStreamPlayer = l["p"]
	var vol: float = l["vol"] * float(l["gain"])
	if vol > 0.002:
		if not p.playing:
			p.play(randf() * maxf(p.stream.get_length() - 0.5, 0.0))
		p.volume_db = linear_to_db(vol)
	elif p.playing:
		p.stop()

func play(key: String, gain := 1.0, pitch := 1.0) -> void:
	if muted or not streams.has(key):
		return
	var e: Dictionary = streams[key]
	var list: Array = e["list"]
	for p in pool:
		if not p.playing:
			p.stream = list[randi() % list.size()]
			p.volume_db = linear_to_db(maxf(gain * float(e["gain"]), 0.0001))
			p.pitch_scale = pitch * randf_range(0.96, 1.04)
			p.play()
			return

func play_at(key: String, pos: Vector3, gain := 1.0, pitch := 1.0) -> void:
	if muted or not streams.has(key):
		return
	var e: Dictionary = streams[key]
	var list: Array = e["list"]
	for p in pool3d:
		if not p.playing:
			p.global_position = pos
			p.stream = list[randi() % list.size()]
			p.volume_db = linear_to_db(maxf(gain * float(e["gain"]), 0.0001)) + 6.0
			p.pitch_scale = pitch * randf_range(0.95, 1.05)
			p.play()
			return

func door(open: bool) -> void:
	play("door_open" if open else "door_close", 0.9)

func set_flux(build: float, crack: float) -> void:
	flux = build
	if crack > 0.2 or build > 0.5:
		crackle_t -= get_process_delta_time()
		if crackle_t <= 0.0:
			crackle_t = randf_range(0.12, 0.45) / maxf(maxf(build, crack), 0.2)
			play("tc_crackle", 0.4 + 0.6 * maxf(build, crack))

func set_radio(on: bool, era: String) -> void:
	radio_on = on
	radio_era = era
	play("radio_static", 0.5)

func on_era_changed(era: String) -> void:
	radio_era = era

func _on_impact(info: Dictionary) -> void:
	var imp := float(info.get("impulse", 0.0))
	var pos: Vector3 = info.get("point", game.car.global_position)
	if imp < 1200.0:
		play_at("impact_light", pos, clampf(imp / 1200.0, 0.2, 1.0))
	elif imp < 9000.0:
		play_at("impact_medium", pos, clampf(imp / 9000.0, 0.4, 1.0))
	else:
		play_at("impact_heavy", pos, 1.0)
		play_at("metal_crunch", pos, clampf(imp / 30000.0, 0.5, 1.0))
	if game.cam:
		game.cam.kick(clampf(imp / 20000.0, 0.0, 1.5))

func _process(dt: float) -> void:
	var c: Car = game.car
	if c == null or not is_instance_valid(c):
		return
	var vs := c.vs
	var th := c.th
	var cam := get_viewport().get_camera_3d()
	var dist := 6.0
	var pan := 0.0
	if cam:
		var rel := c.global_position - cam.global_position
		dist = rel.length()
		pan = clampf(rel.dot(cam.global_transform.basis.x) / maxf(dist, 1.0), -1.0, 1.0) * 0.6
	var near_gain := clampf(7.0 / maxf(dist, 1.0), 0.0, 1.4)
	var inside: bool = game.cam.fpp
	var vis := c.visible and not c.in_limbo
	m_rpm = vs.motor_rpm
	m_load = vs.load if vs.contacts > 0 else vs.load * 0.3
	m_regen = clampf(vs.regen_force / 9000.0, 0.0, 1.0) * clampf(vs.fwd_speed / 6.0, 0.0, 1.0) + c.input.brake * clampf(vs.fwd_speed / 10.0, 0.0, 1.0) * 0.6
	var tsum := 0.0
	var fsum := 0.0
	var boost := 0.0
	for nz in th.all:
		var t := nz.force.length() / maxf(nz.thrust_max, 1.0)
		tsum += t
		if nz.front:
			fsum += t
		elif nz.pitch < 0.4:
			boost += t
	m_thrust = clampf(tsum / 4.0, 0.0, 1.5) if vis else 0.0
	m_boost = clampf(boost / 4.0, 0.0, 1.0) if vis else 0.0
	m_front = clampf(fsum / 2.0, 0.0, 1.0)
	m_pan = pan
	m_gain = (1.0 if inside else near_gain) * (1.0 if vis else 0.0)
	var thrusting := m_thrust > 0.08
	if thrusting and not prev_thrusting:
		play("thrust_start", 0.7 * m_gain)
	elif not thrusting and prev_thrusting:
		play("thrust_stop", 0.6 * m_gain)
	prev_thrusting = thrusting
	var boosting := m_boost > 0.5
	if boosting and not prev_boost:
		play("boost_big", 0.9 * m_gain)
	prev_boost = boosting
	for nz in th.all:
		if nz.puff == 1:
			play("valve_puff", 0.35 * m_gain)
	if (th.deploy > 0.02 and prev_deploy <= 0.02) or (th.deploy < 0.98 and prev_deploy >= 0.98):
		play("flap_servo", 0.6 * m_gain)
	prev_deploy = th.deploy
	var spd := c.linear_velocity.length()
	var on_ground := vs.contacts > 0
	var skid := 0.0
	for i in vs.wheels.size():
		var w = vs.wheels[i]
		if w.contact:
			skid = maxf(skid, clampf((w.slip_vel - 3.0) / 10.0, 0.0, 1.0))
			var cv: float = (w.compression - w.prev_comp) * 120.0
			if cv > 1.6 and prev_contact_v[i] <= 1.6:
				play_at("suspension_thump", w.point, clampf(cv / 5.0, 0.3, 1.0))
			prev_contact_v[i] = cv
	var wind := clampf(spd / 90.0, 0.0, 1.0)
	_loop_vol("tyre_roll_loop", (clampf(spd / 30.0, 0.0, 1.0) * 0.8 if on_ground else 0.0) * m_gain * (0.5 if inside else 1.0), dt)
	_loop_vol("tyre_skid_loop", skid * m_gain, dt, 10.0)
	_loop_vol("wind_loop", wind * wind * (0.7 if inside else 1.0) * (1.0 if vis else 0.0), dt)
	_loop_vol("metal_scrape_loop", clampf(c.scrape * 1.6, 0.0, 1.0) * m_gain, dt, 12.0)
	_loop_vol("tc_flux_loop", flux, dt, 3.0)
	_loop_vol("thrust_loop", clampf(m_thrust, 0.0, 1.0) * 0.6 * m_gain, dt, 14.0)
	if loops.has("wind_loop"):
		loops["wind_loop"]["p"].pitch_scale = 0.8 + wind * 0.5
	if loops.has("tyre_roll_loop"):
		loops["tyre_roll_loop"]["p"].pitch_scale = 0.7 + clampf(spd / 60.0, 0.0, 1.0) * 0.6
	var radio_static := 0.0
	for e in ["hadean", "dino", "1885", "2026", "2080", "ruins", "scifi"]:
		_loop_vol("music_" + e, (0.8 if (radio_on and e == radio_era) else 0.0) * (1.0 if inside else 0.35), dt, 1.5)
	_loop_vol("radio_static", radio_static, dt)
	var f0 := maxf(m_rpm, 1.0) / 60.0
	var spd_k := clampf(f0 / 900.0, 0.0, 1.0)
	var low_k := clampf(f0 / 30.0, 0.0, 1.0)
	var g := (1.0 if vis else 0.0) * (0.75 if inside else 1.0)
	_layer("whine", (0.1 + 0.32 * m_load) * (0.25 + 0.75 * spd_k) * low_k * g, f0 * 2.0 / 200.0, dt)
	_layer("gear", (0.05 + 0.2 * m_load) * spd_k * g, f0 * 4.5 / 300.0, dt)
	_layer("hum", 0.18 * (0.3 + 0.7 * m_load) * low_k * g, f0 * 0.5 / 100.0, dt)
	_layer("inverter", 0.06 * (0.2 + m_load) * low_k * g, 0.9 + 0.25 * m_load, dt)
	_layer("regen", 0.22 * m_regen * spd_k * g, f0 * 4.5 * 0.97 / 300.0, dt)
	_layer("hiss", clampf(m_thrust, 0.0, 1.2) * 0.75 * g, 0.55 + 0.6 * clampf(m_thrust, 0.0, 1.0) + 0.2 * m_boost, dt, 14.0)
	_layer("rumble", m_boost * 0.9 * g, 0.7 + 0.4 * m_boost, dt, 8.0)
