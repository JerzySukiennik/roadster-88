# Lattice: node-beam damage lattice (CONTRACT section 4) with an XPBD solver, plastic yield and breaking, an advancing intruder for impacts, and per-node affine frames for GPU skinning.
class_name Lattice
extends RefCounted

var n := 0
var p0 := PackedVector3Array()
var p := PackedVector3Array()
var pp := PackedVector3Array()
var v := PackedVector3Array()
var m := PackedFloat32Array()
var w := PackedFloat32Array()
var zone := PackedStringArray()
var ba := PackedInt32Array()
var bb := PackedInt32Array()
var bl0 := PackedFloat32Array()
var bl_orig := PackedFloat32Array()
var bk := PackedFloat32Array()
var bd := PackedFloat32Array()
var byield := PackedFloat32Array()
var bbreak := PackedFloat32Array()
var balive := PackedByteArray()
var bclass := PackedStringArray()
var parts: Dictionary = {}
var wheels: Dictionary = {}
var nozzles: Dictionary = {}
var neighbors: Array = []
var stiff_nodes := PackedInt32Array()
var total_mass := 0.0
var active := false
var active_t := 0.0
var window := 0.6
var substeps := 6
var touched := PackedByteArray()
var beam_active := PackedByteArray()
var intruders: Array = []
var broken_count := 0
var plastic_total := 0.0
var dirty := false
var cost_ms := 0.0

func load_dict(d: Dictionary) -> void:
	var nodes: Array = d.get("nodes", [])
	n = nodes.size()
	p0.resize(n)
	m.resize(n)
	zone.resize(n)
	for i in n:
		var nd: Dictionary = nodes[i]
		var id := int(nd.get("id", i))
		var pa: Array = nd["p"]
		p0[id] = Vector3(float(pa[0]), float(pa[1]), float(pa[2]))
		m[id] = float(nd.get("m", 10.0))
		zone[id] = String(nd.get("zone", "cabin"))
	var beams: Array = d.get("beams", [])
	var nb := beams.size()
	ba.resize(nb)
	bb.resize(nb)
	bl0.resize(nb)
	bl_orig.resize(nb)
	bk.resize(nb)
	bd.resize(nb)
	byield.resize(nb)
	bbreak.resize(nb)
	balive.resize(nb)
	bclass.resize(nb)
	for i in nb:
		var be: Dictionary = beams[i]
		ba[i] = int(be["a"])
		bb[i] = int(be["b"])
		bk[i] = float(be.get("k", 2.4e6))
		bd[i] = float(be.get("d", 900.0))
		byield[i] = float(be.get("yield", 0.015))
		bbreak[i] = float(be.get("break", 0.22))
		bclass[i] = String(be.get("class", ""))
		balive[i] = 1
	parts = d.get("parts_map", {})
	parts = {}
	for pt in d.get("parts", []):
		var pd: Dictionary = pt
		parts[String(pd["name"])] = {"nodes": PackedInt32Array(pd.get("nodes", [])), "break_impulse": float(pd.get("break_impulse", 9000.0)), "detached": false}
	wheels = {}
	var wd: Dictionary = d.get("wheels", {})
	for k in wd.keys():
		wheels[k] = PackedInt32Array(wd[k])
	nozzles = {}
	var nd2: Dictionary = d.get("nozzles", {})
	for k in nd2.keys():
		nozzles[k] = PackedInt32Array(nd2[k])
	_finish()

func _finish() -> void:
	p = p0.duplicate()
	pp = p0.duplicate()
	v.resize(n)
	w.resize(n)
	touched.resize(n)
	total_mass = 0.0
	for i in n:
		v[i] = Vector3.ZERO
		w[i] = 1.0 / maxf(m[i], 0.1)
		total_mass += m[i]
	for i in ba.size():
		var l := p0[ba[i]].distance_to(p0[bb[i]])
		bl0[i] = l
		bl_orig[i] = l
	beam_active.resize(ba.size())
	neighbors.clear()
	for i in n:
		neighbors.append(PackedInt32Array())
	for i in ba.size():
		var a := ba[i]
		var b := bb[i]
		var na: PackedInt32Array = neighbors[a]
		na.append(i)
		neighbors[a] = na
		var nb2: PackedInt32Array = neighbors[b]
		nb2.append(i)
		neighbors[b] = nb2
	stiff_nodes.clear()
	for i in n:
		if zone[i] == "cabin" or zone[i] == "floor":
			stiff_nodes.append(i)

func reset() -> void:
	p = p0.duplicate()
	pp = p0.duplicate()
	for i in n:
		v[i] = Vector3.ZERO
	for i in ba.size():
		bl0[i] = bl_orig[i]
		balive[i] = 1
	for k in parts.keys():
		parts[k]["detached"] = false
	active = false
	broken_count = 0
	plastic_total = 0.0

func displacement(i: int) -> Vector3:
	return p[i] - p0[i]

func impact(point: Vector3, normal_in: Vector3, speed: float, m_eff: float, radius: float, max_depth: float) -> void:
	var energy := 0.5 * m_eff * speed * speed
	var depth := maxf(max_depth, 0.01)
	intruders.append({"q": point - normal_in * 0.02, "n": normal_in.normalized(), "e": energy, "m": m_eff, "r": radius, "d": 0.0, "max": depth, "v": speed, "a": speed * speed / (2.0 * depth), "seed": randf() * 100.0})
	var falloff := clampf(0.5 + depth * 0.6, 0.5, 2.2)
	var reach := maxf(radius, 0.6) + falloff * 2.2 + depth
	for i in n:
		var dist := p[i].distance_to(point)
		if dist < reach:
			touched[i] = 1
		var loc := exp(-dist / falloff)
		var stiff := 0.35 if (zone[i] == "cabin" or zone[i] == "floor") else 1.0
		var wi := clampf(loc * stiff, 0.004, 1.0) / maxf(m[i], 0.1)
		if active:
			w[i] = maxf(w[i], wi)
		else:
			w[i] = wi
	for i in ba.size():
		if touched[ba[i]] == 1 or touched[bb[i]] == 1:
			beam_active[i] = 1
	active = true
	active_t = 0.0

func step(dt: float) -> void:
	if not active:
		return
	var t0 := Time.get_ticks_usec()
	active_t += dt
	var nb := ba.size()
	var act := PackedInt32Array()
	for i in nb:
		if beam_active[i] == 1 and balive[i] == 1:
			act.append(i)
	var nodes_act := PackedInt32Array()
	for i in n:
		if touched[i] == 1:
			nodes_act.append(i)
	var moving := false
	for it in intruders:
		var vv: float = it["v"]
		if vv > 0.0:
			var dd: float = float(it["d"]) + vv * dt
			vv -= float(it["a"]) * dt
			if dd >= float(it["max"]) or vv <= 0.0:
				dd = minf(dd, float(it["max"]))
				vv = 0.0
			it["d"] = dd
			it["v"] = maxf(vv, 0.0)
			moving = true
	var work := 0.0
	for k in substeps:
		for it in intruders:
			var nrm: Vector3 = it["n"]
			var q: Vector3 = it["q"] + nrm * float(it["d"])
			var rad: float = it["r"]
			var sd: float = it["seed"]
			for i in nodes_act:
				var rel := p[i] - q
				var depth := -rel.dot(nrm)
				if depth > 0.0:
					var lat_v := rel + nrm * depth
					var lat := lat_v.length()
					if lat < rad:
						var push := nrm * depth
						var bz := zone[i]
						if bz != "floor":
							var hsh := sin(float(i) * 12.9898 + sd) * 43758.5453
							hsh = hsh - floor(hsh)
							var side := lat_v.normalized() if lat > 0.01 else Vector3.ZERO
							push += (side * 0.35 + Vector3.UP * (0.25 if bz == "roof" or bz == "cabin" else 0.12) * (hsh - 0.3)) * depth
						p[i] += push
		for bi in act:
			if balive[bi] == 0:
				continue
			var a := ba[bi]
			var b := bb[bi]
			var wa := w[a]
			var wb := w[b]
			var wsum := wa + wb
			if wsum <= 0.0:
				continue
			var dvec := p[b] - p[a]
			var l := dvec.length()
			if l < 1e-6:
				continue
			var lo := bl_orig[bi]
			var strain := (l - bl0[bi]) / lo
			var ay := absf(strain)
			if ay > byield[bi]:
				var excess := (ay - byield[bi]) * signf(strain) * lo
				var nl0 := maxf(bl0[bi] + excess, lo * 0.18)
				var dl0 := absf(nl0 - bl0[bi])
				bl0[bi] = nl0
				plastic_total += dl0
				work += bk[bi] * lo * byield[bi] * dl0
			if l > lo * (1.0 + bbreak[bi]):
				balive[bi] = 0
				broken_count += 1
				continue
			var c := l - bl0[bi]
			var dirv := dvec / l
			var corr := c / wsum
			p[a] += dirv * (corr * wa)
			p[b] -= dirv * (corr * wb)
	dirty = true
	if not moving:
		active_t = maxf(active_t, window - 0.1)
	if active_t > window or (not moving and active_t > 0.15):
		active = false
		intruders.clear()
		for i in nb:
			beam_active[i] = 0
	cost_ms = float(Time.get_ticks_usec() - t0) / 1000.0

func node_frames(img: Image) -> void:
	for i in n:
		var rot := Basis.IDENTITY
		if touched[i] == 1:
			var nb: PackedInt32Array = neighbors[i]
			var cov := Basis(Vector3.ZERO, Vector3.ZERO, Vector3.ZERO)
			var cnt := 0
			for bi in nb:
				if balive[bi] == 0:
					continue
				var j2 := bb[bi] if ba[bi] == i else ba[bi]
				var r0 := p0[j2] - p0[i]
				var r1 := p[j2] - p[i]
				cov.x += r1 * r0.x
				cov.y += r1 * r0.y
				cov.z += r1 * r0.z
				cnt += 1
			if cnt >= 4:
				rot = _polar(cov)
		var t := p[i] - rot * p0[i]
		img.set_pixel(i, 0, Color(rot.x.x, rot.x.y, rot.x.z, 0))
		img.set_pixel(i, 1, Color(rot.y.x, rot.y.y, rot.y.z, 0))
		img.set_pixel(i, 2, Color(rot.z.x, rot.z.y, rot.z.z, 0))
		img.set_pixel(i, 3, Color(t.x, t.y, t.z, 1))

static func _polar(a: Basis) -> Basis:
	var det := a.determinant()
	if absf(det) < 1e-6:
		return Basis.IDENTITY
	var r := a
	for k in 8:
		var dd := r.determinant()
		if absf(dd) < 1e-8:
			return Basis.IDENTITY
		var inv_t := r.inverse().transposed()
		r = Basis(r.x * 0.5 + inv_t.x * 0.5, r.y * 0.5 + inv_t.y * 0.5, r.z * 0.5 + inv_t.z * 0.5)
	r = r.orthonormalized()
	if r.determinant() < 0.5:
		return Basis.IDENTITY
	return r

func crush_extent() -> Dictionary:
	var minz := 1e9
	var maxz := -1e9
	var maxx := -1e9
	var minx := 1e9
	var maxy := -1e9
	var minz0 := 1e9
	var maxz0 := -1e9
	var maxx0 := -1e9
	var minx0 := 1e9
	var maxy0 := -1e9
	for i in n:
		minz = minf(minz, p[i].z)
		maxz = maxf(maxz, p[i].z)
		maxx = maxf(maxx, p[i].x)
		minx = minf(minx, p[i].x)
		maxy = maxf(maxy, p[i].y)
		minz0 = minf(minz0, p0[i].z)
		maxz0 = maxf(maxz0, p0[i].z)
		maxx0 = maxf(maxx0, p0[i].x)
		minx0 = minf(minx0, p0[i].x)
		maxy0 = maxf(maxy0, p0[i].y)
	return {"front": maxf(0.0, maxz0 - maxz), "rear": maxf(0.0, minz - minz0), "left": maxf(0.0, maxx0 - maxx), "right": maxf(0.0, minx - minx0), "roof": maxf(0.0, maxy0 - maxy)}

func mean_disp(ids: PackedInt32Array) -> Vector3:
	var s := Vector3.ZERO
	if ids.is_empty():
		return s
	for i in ids:
		s += p[i] - p0[i]
	return s / ids.size()

func to_dict() -> Dictionary:
	var nodes := []
	for i in n:
		nodes.append({"id": i, "p": [snappedf(p0[i].x, 0.0001), snappedf(p0[i].y, 0.0001), snappedf(p0[i].z, 0.0001)], "m": snappedf(m[i], 0.01), "zone": zone[i]})
	var beams := []
	for i in ba.size():
		beams.append({"a": ba[i], "b": bb[i], "k": bk[i], "d": bd[i], "yield": byield[i], "break": bbreak[i], "class": bclass[i]})
	var pl := []
	for k in parts.keys():
		pl.append({"name": k, "nodes": Array(parts[k]["nodes"]), "break_impulse": parts[k]["break_impulse"]})
	var wd := {}
	for k in wheels.keys():
		wd[k] = Array(wheels[k])
	var nd := {}
	for k in nozzles.keys():
		nd[k] = Array(nozzles[k])
	return {"version": 1, "nodes": nodes, "beams": beams, "parts": pl, "wheels": wd, "nozzles": nd}
