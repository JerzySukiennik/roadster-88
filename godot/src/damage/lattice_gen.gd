# LatticeGen: builds a placeholder damage lattice in the CONTRACT section 4 format from the car volume (crumple zones front and rear, stiff cabin and floor, parts, wheels, nozzles).
class_name LatticeGen
extends RefCounted

static func generate() -> Dictionary:
	var t := Tuning.data()
	var c: Dictionary = t["car"]
	var mass := float(c["mass"])
	var ph := CarPlaceholder.new()
	ph.P_W_s = ph._scale_tab(CarPlaceholder.P_W)
	ph.P_YB_s = ph._scale_tab(CarPlaceholder.P_YB)
	ph.P_YS_s = ph._scale_tab(CarPlaceholder.P_YS)
	ph.P_YC_s = ph._scale_tab(CarPlaceholder.P_YC)
	ph.P_XC_s = ph._scale_tab(CarPlaceholder.P_XC)
	ph.P_YT_s = ph._scale_tab(CarPlaceholder.P_YT)
	ph.P_ROOF_s = CarPlaceholder.P_ROOF
	var nose := ph.nose - 0.06
	var tail := ph.tail + 0.06
	var stations := 12
	var zs := []
	for i in stations:
		zs.append(lerpf(tail, nose, float(i) / (stations - 1)))
	var cols := [-0.92, -0.46, 0.0, 0.46, 0.92]
	var nodes := []
	var grid := {}
	var axle_f: float = ph.axle_f
	var axle_r: float = ph.axle_r
	for si in zs.size():
		var z: float = zs[si]
		var st := ph._station(z)
		var in_cabin := z > CarPlaceholder.Z_RG + 0.1 and z < CarPlaceholder.Z_WS - 0.05
		var levels := [float(st.yb) + 0.04, float(st.ys), float(st.yc) - 0.03]
		if in_cabin:
			levels.append(ph._roof_y(z) - 0.05)
		for li in levels.size():
			for ci in cols.size():
				var fx: float = cols[ci]
				var y: float = levels[li]
				var half: float = float(st.w) * 0.96
				if li == 2:
					half = float(st.xc) * 0.95
				if li == 3:
					half = float(st.xc) * 0.62
				var x := fx * half
				if li == 2 and not in_cabin and absf(fx) < 0.5:
					var xn: float = x / maxf(float(st.xc), 0.01)
					y = float(st.yc) + (float(st.yt) - float(st.yc)) * (0.5 + 0.5 * cos(clampf(xn, -1.0, 1.0) * PI)) - 0.03
				var zn := "cabin"
				if z > axle_f - 0.35:
					zn = "front"
				elif z < axle_r + 0.35:
					zn = "rear"
				if li == 0 and zn == "cabin":
					zn = "floor"
				if li == 3:
					zn = "roof"
				var id := nodes.size()
				nodes.append({"id": id, "p": [x, y, z], "m": 1.0, "zone": zn})
				grid[Vector3i(si, li, ci)] = id
	var beams := []
	var seen := {}
	var add := func(a: int, b: int) -> void:
		if a == b:
			return
		var key := Vector2i(mini(a, b), maxi(a, b))
		if seen.has(key):
			return
		seen[key] = true
		var za: String = nodes[a]["zone"]
		var zb: String = nodes[b]["zone"]
		var cls := "cabin"
		if za == "front" or zb == "front" or za == "rear" or zb == "rear":
			cls = "crumple"
		elif za == "floor" and zb == "floor":
			cls = "floor"
		elif za == "roof" or zb == "roof":
			cls = "roof"
		var k := 2.2e6
		var yl := 0.012
		var br := 0.26
		match cls:
			"cabin":
				k = 7.0e6
				yl = 0.03
				br = 0.4
			"floor":
				k = 1.2e7
				yl = 0.045
				br = 0.5
			"roof":
				k = 3.5e6
				yl = 0.02
				br = 0.35
		beams.append({"a": a, "b": b, "k": k, "d": 900.0, "yield": yl, "break": br, "class": cls})
	for key in grid.keys():
		var k3: Vector3i = key
		var id: int = grid[k3]
		for d in [Vector3i(1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, 0, 1), Vector3i(1, 1, 0), Vector3i(1, 0, 1), Vector3i(0, 1, 1), Vector3i(1, -1, 0), Vector3i(1, 0, -1), Vector3i(0, 1, -1)]:
			var o: Vector3i = k3 + d
			if grid.has(o):
				add.call(id, grid[o])
		if k3.y == 2:
			var up := Vector3i(k3.x, 3, k3.z)
			for dz in [-1, 1]:
				var oz := Vector3i(k3.x + dz, 3, k3.z)
				if grid.has(oz) and not grid.has(up):
					add.call(id, grid[oz])
	var weights := []
	var wsum := 0.0
	for nd in nodes:
		var wt := 1.0
		match String(nd["zone"]):
			"floor":
				wt = 2.4
			"cabin":
				wt = 1.0
			"roof":
				wt = 0.5
			"front", "rear":
				wt = 0.8
		weights.append(wt)
		wsum += wt
	for i in nodes.size():
		nodes[i]["m"] = snappedf(mass * weights[i] / wsum, 0.01)
	var parts := []
	var pf := []
	var pr := []
	for nd in nodes:
		var pz: float = nd["p"][2]
		var py: float = nd["p"][1]
		if pz > nose - 0.05 and py < 0.6:
			pf.append(nd["id"])
		if pz < tail + 0.05 and py < 0.72:
			pr.append(nd["id"])
	parts.append({"name": "Bumper_F", "nodes": pf, "break_impulse": 26000})
	parts.append({"name": "Bumper_R", "nodes": pr, "break_impulse": 26000})
	parts.append({"name": "Flap_F", "nodes": _near(nodes, Vector3(0, 0.3, nose), 2), "break_impulse": 7000})
	parts.append({"name": "Door_L", "nodes": _near(nodes, Vector3(0.95, 0.5, 0.15), 4), "break_impulse": 45000})
	parts.append({"name": "Door_R", "nodes": _near(nodes, Vector3(-0.95, 0.5, 0.15), 4), "break_impulse": 45000})
	parts.append({"name": "Mirror_L", "nodes": _near(nodes, Vector3(0.85, 0.85, 0.6), 1), "break_impulse": 2500})
	parts.append({"name": "Mirror_R", "nodes": _near(nodes, Vector3(-0.85, 0.85, 0.6), 1), "break_impulse": 2500})
	parts.append({"name": "Wing", "nodes": _near(nodes, Vector3(0, 0.95, tail + 0.2), 3), "break_impulse": 9000})
	parts.append({"name": "Roof_Targa", "nodes": _near(nodes, Vector3(0, 1.1, -0.4), 3), "break_impulse": 30000})
	var wheels := {}
	for corner in ["FL", "FR", "RL", "RR"]:
		var front: bool = corner[0] == "F"
		var tr := float(c["track_front"]) if front else float(c["track_rear"])
		var hub := Vector3((1.0 if corner[1] == "L" else -1.0) * tr * 0.5, 0.35, axle_f if front else axle_r)
		var ids := _near(nodes, hub, 3)
		wheels["Wheel_" + corner] = ids
		parts.append({"name": "Wheel_" + corner, "nodes": ids, "break_impulse": 60000})
	var nozzles := {}
	var th: Dictionary = t["thrusters"]
	var rn := ["Nozzle_RL1", "Nozzle_RL2", "Nozzle_RR2", "Nozzle_RR1"]
	var rp: Array = th["rear"]["positions"]
	for i in rp.size():
		var ids2 := _near(nodes, Vector3(float(rp[i][0]), float(rp[i][1]), float(rp[i][2])), 2)
		nozzles[rn[i]] = ids2
		parts.append({"name": rn[i], "nodes": ids2, "break_impulse": 30000})
	var fp: Array = th["front"]["positions"]
	var fn := ["Nozzle_FL", "Nozzle_FR"]
	for i in fp.size():
		var ids3 := _near(nodes, Vector3(float(fp[i][0]), float(fp[i][1]), float(fp[i][2])), 2)
		nozzles[fn[i]] = ids3
		parts.append({"name": fn[i], "nodes": ids3, "break_impulse": 24000})
	if th.has("side"):
		var sp: Array = th["side"]["positions"]
		var sn := ["Nozzle_SL1", "Nozzle_SL2", "Nozzle_SR1", "Nozzle_SR2"]
		for i in mini(sp.size(), sn.size()):
			var ids4 := _near(nodes, Vector3(float(sp[i][0]), float(sp[i][1]), float(sp[i][2])), 2)
			nozzles[sn[i]] = ids4
			parts.append({"name": sn[i], "nodes": ids4, "break_impulse": 24000})
	return {"version": 1, "nodes": nodes, "beams": beams, "parts": parts, "wheels": wheels, "nozzles": nozzles}

static func _near(nodes: Array, p: Vector3, count: int) -> Array:
	var d := []
	for nd in nodes:
		var q := Vector3(nd["p"][0], nd["p"][1], nd["p"][2])
		d.append([q.distance_squared_to(p), nd["id"]])
	d.sort_custom(func(a, b): return a[0] < b[0])
	var out := []
	for i in mini(count, d.size()):
		out.append(d[i][1])
	return out
