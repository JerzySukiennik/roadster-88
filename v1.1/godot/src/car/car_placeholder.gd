# CarPlaceholder: procedural stand-in for roadster.glb with the exact contract node names, pivots and material names (lofted body, glass canopy, wheels, nozzles, interior).
class_name CarPlaceholder
extends RefCounted

const NZ := 150
const HALF_UP := 12
const HALF_LO := 18
const TOP_SEG := 18
const CAN_SEG := 24

var t: Dictionary
var length: float
var nose: float
var tail: float
var wb: float
var axle_f: float
var axle_r: float
var rf: float
var rr: float
var surfaces: Dictionary = {}
var root: Node3D

const P_W := [[-2.21, 0.82], [-2.15, 0.91], [-1.95, 0.975], [-1.42, 1.0], [-0.9, 0.985], [-0.35, 0.95], [0.3, 0.945], [0.95, 0.955], [1.42, 0.975], [1.9, 0.94], [2.12, 0.80], [2.255, 0.52]]
const P_YB := [[-2.21, 0.30], [-2.15, 0.25], [-1.95, 0.19], [-1.42, 0.16], [-0.9, 0.14], [-0.35, 0.13], [0.3, 0.13], [0.95, 0.13], [1.42, 0.14], [1.9, 0.14], [2.12, 0.15], [2.255, 0.18]]
const P_YS := [[-2.21, 0.62], [-2.15, 0.65], [-1.95, 0.68], [-1.42, 0.68], [-0.9, 0.62], [-0.35, 0.53], [0.3, 0.52], [0.95, 0.54], [1.42, 0.58], [1.9, 0.54], [2.12, 0.44], [2.255, 0.33]]
const P_YC := [[-2.21, 0.86], [-2.15, 0.91], [-1.95, 0.965], [-1.42, 1.0], [-0.9, 0.93], [-0.35, 0.835], [0.3, 0.805], [0.95, 0.80], [1.42, 0.805], [1.9, 0.71], [2.12, 0.56], [2.255, 0.43]]
const P_XC := [[-2.21, 0.62], [-2.15, 0.72], [-1.95, 0.80], [-1.42, 0.84], [-0.9, 0.82], [-0.35, 0.79], [0.3, 0.785], [0.95, 0.775], [1.42, 0.75], [1.9, 0.70], [2.12, 0.56], [2.255, 0.33]]
const P_YT := [[-2.21, 0.87], [-2.15, 0.92], [-1.95, 0.955], [-1.42, 0.975], [-1.35, 0.975], [1.05, 0.80], [1.42, 0.725], [1.9, 0.645], [2.12, 0.54], [2.255, 0.435]]
const P_ROOF := [[-1.35, 0.975], [-1.05, 1.04], [-0.7, 1.10], [-0.35, 1.13], [-0.05, 1.12], [0.3, 1.07], [0.65, 0.975], [1.05, 0.805]]
const Z_WS := 1.05
const Z_RG := -1.35

func _init() -> void:
	t = Tuning.data()
	var c: Dictionary = t["car"]
	length = float(c["length"])
	wb = float(c["wheelbase"])
	axle_f = wb * 0.5
	axle_r = -wb * 0.5
	nose = length * 0.5 + 0.02
	tail = -length * 0.5 + 0.025
	rf = float(t["wheels"]["radius_front"])
	rr = float(t["wheels"]["radius_rear"])

static func interp(tab: Array, z: float) -> float:
	if z <= tab[0][0]:
		return tab[0][1]
	var n := tab.size()
	if z >= tab[n - 1][0]:
		return tab[n - 1][1]
	var i := 0
	while i < n - 2 and z > tab[i + 1][0]:
		i += 1
	var z0: float = tab[i][0]
	var z1: float = tab[i + 1][0]
	var y0: float = tab[i][1]
	var y1: float = tab[i + 1][1]
	var m0 := _slope(tab, i)
	var m1 := _slope(tab, i + 1)
	var h := z1 - z0
	var s := (z - z0) / h
	var s2 := s * s
	var s3 := s2 * s
	return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1

static func _slope(tab: Array, i: int) -> float:
	var n := tab.size()
	if i == 0:
		return (tab[1][1] - tab[0][1]) / (tab[1][0] - tab[0][0])
	if i == n - 1:
		return (tab[n - 1][1] - tab[n - 2][1]) / (tab[n - 1][0] - tab[n - 2][0])
	var d0: float = (tab[i][1] - tab[i - 1][1]) / (tab[i][0] - tab[i - 1][0])
	var d1: float = (tab[i + 1][1] - tab[i][1]) / (tab[i + 1][0] - tab[i][0])
	if d0 * d1 <= 0.0:
		return 0.0
	return 2.0 / (1.0 / d0 + 1.0 / d1)

func _zmap(u: float) -> float:
	var k := 0.5 - 0.5 * cos(u * PI)
	var lin := u
	return lerpf(tail, nose, lerpf(lin, k, 0.45))

func _scale_tab(tab: Array) -> Array:
	var out := []
	var sf := nose / 2.255
	var sr := tail / -2.21
	for p in tab:
		var z: float = p[0]
		out.append([z * (sf if z > 0.0 else sr), p[1]])
	return out

func build() -> Node3D:
	root = Node3D.new()
	root.name = "Roadster"
	_build_body()
	_build_canopy()
	_build_wheels()
	_build_nozzles()
	_build_lights()
	_build_details()
	_build_interior()
	_build_anchors()
	_flush()
	for nzn in ["Nozzle_RL1", "Nozzle_RL2", "Nozzle_RR1", "Nozzle_RR2", "Nozzle_FL", "Nozzle_FR"]:
		var nzo := root.find_child(nzn, true, false) as Node3D
		if nzo:
			var ex := Node3D.new()
			ex.name = "Exhaust_" + nzn
			ex.position = Vector3(0, 0, 0.06) if nzn.begins_with("Nozzle_F") else Vector3(0, 0, -0.155)
			nzo.add_child(ex)
	var swn := root.find_child("SteeringWheel", true, false) as Node3D
	if swn and grips.size() == 2:
		for k in 2:
			var gn := Node3D.new()
			gn.name = "Grip_L" if k == 0 else "Grip_R"
			swn.add_child(gn)
			gn.position = swn.transform.affine_inverse() * grips[k]
	return root

func _surf(node_name: String, mat: String) -> SurfaceTool:
	var key := node_name + "|" + mat
	if not surfaces.has(key):
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		st.set_custom_format(2, SurfaceTool.CUSTOM_RGBA_FLOAT)
		surfaces[key] = st
	return surfaces[key]

func _tri(node_name: String, mat: String, a: Vector3, b: Vector3, c: Vector3, na: Vector3, nb: Vector3, nc: Vector3, ua := Vector2(-9, -9), ub := Vector2(-9, -9), uc := Vector2(-9, -9)) -> void:
	var st := _surf(node_name, mat)
	var fn := (c - a).cross(b - a)
	if fn.length_squared() < 1e-16:
		return
	var vs := [a, b, c]
	var nrm := [na, nb, nc]
	var uvs := [ua, ub, uc]
	if fn.dot(na + nb + nc) < 0.0:
		vs = [a, c, b]
		nrm = [na, nc, nb]
		uvs = [ua, uc, ub]
	for k in 3:
		var p: Vector3 = vs[k]
		var n: Vector3 = nrm[k]
		var uv: Vector2 = uvs[k]
		st.set_normal(n)
		st.set_uv(uv if uv.x > -8.0 else Vector2(p.z, p.y))
		st.set_custom(2, Color(p.x, p.y, p.z, 1.0))
		st.add_vertex(p)

func _quad(node_name: String, mat: String, a: Vector3, b: Vector3, c: Vector3, d: Vector3, na: Vector3, nb: Vector3, nc: Vector3, nd: Vector3) -> void:
	_tri(node_name, mat, a, b, c, na, nb, nc)
	_tri(node_name, mat, a, c, d, na, nc, nd)

var pivots := {}
var parents := {}
var pivot_basis := {}
var grips := []

func _set_pivot(node_name: String, pivot: Vector3, parent: String = "") -> void:
	pivots[node_name] = pivot
	if parent != "":
		parents[node_name] = parent

func _flush() -> void:
	var nodes := {}
	var order := ["Body_Shell", "Hood", "Bumper_F", "Bumper_R", "Underbody", "Door_L", "Door_R", "Mirror_L", "Mirror_R", "Flap_F", "Wing", "Roof_Targa", "Glass_Windshield", "Glass_Rear", "Glass_Door_L", "Glass_Door_R", "Glass_Quarter_L", "Glass_Quarter_R", "Light_Head_L", "Light_Head_R", "Light_Tail", "Interior", "SteeringWheel", "Screen", "Cluster", "Diffuser"]
	var names := []
	for k in surfaces.keys():
		var nm: String = k.split("|")[0]
		if not names.has(nm):
			names.append(nm)
	names.sort_custom(func(a, b): return (order.find(a) if order.has(a) else 999) < (order.find(b) if order.has(b) else 999))
	for nm in names:
		var mesh := ArrayMesh.new()
		for k in surfaces.keys():
			if k.split("|")[0] != nm:
				continue
			var st: SurfaceTool = surfaces[k]
			var arrays := st.commit_to_arrays()
			var piv: Vector3 = pivots.get(nm, Vector3.ZERO)
			var pb: Basis = pivot_basis.get(nm, Basis.IDENTITY)
			var pbi := pb.inverse()
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var nrms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
			for i in verts.size():
				verts[i] = pbi * (verts[i] - piv)
				nrms[i] = pbi * nrms[i]
			arrays[Mesh.ARRAY_VERTEX] = verts
			arrays[Mesh.ARRAY_NORMAL] = nrms
			var flags := (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM2_SHIFT)
			mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, flags)
			var mat := StandardMaterial3D.new()
			mat.resource_name = k.split("|")[1]
			mesh.surface_set_material(mesh.get_surface_count() - 1, mat)
		var mi := MeshInstance3D.new()
		mi.name = nm
		mi.mesh = mesh
		mi.position = pivots.get(nm, Vector3.ZERO)
		mi.basis = pivot_basis.get(nm, Basis.IDENTITY)
		nodes[nm] = mi
	for nm in nodes.keys():
		var par: String = parents.get(nm, "")
		var node: Node3D = nodes[nm]
		var pn: Node3D = root
		if par != "":
			if nodes.has(par):
				pn = nodes[par]
			else:
				var found := root.find_child(par, true, false)
				if found:
					pn = found
		if pn != root:
			node.position -= _global_pivot(par)
		pn.add_child(node)

func _global_pivot(nm: String) -> Vector3:
	var p: Vector3 = pivots.get(nm, Vector3.ZERO)
	var par: String = parents.get(nm, "")
	if par != "":
		return p
	return p

func _station(z: float) -> Dictionary:
	return {
		"w": interp(P_W_s, z), "yb": interp(P_YB_s, z), "ys": interp(P_YS_s, z),
		"yc": interp(P_YC_s, z), "xc": interp(P_XC_s, z), "yt": interp(P_YT_s, z),
	}

var P_W_s: Array
var P_YB_s: Array
var P_YS_s: Array
var P_YC_s: Array
var P_XC_s: Array
var P_YT_s: Array
var P_ROOF_s: Array

func _ring_half(st: Dictionary) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var w: float = st.w
	var xc: float = st.xc
	var yc: float = st.yc
	var ys: float = st.ys
	var yb: float = st.yb
	for i in HALF_UP + 1:
		var th := float(i) / HALF_UP * PI * 0.5
		var x := xc + (w - xc) * pow(sin(th), 2.0 / 2.4)
		var y := ys + (yc - ys) * pow(cos(th), 2.0 / 2.4)
		pts.append(Vector2(x, y))
	for i in range(1, HALF_LO + 1):
		var ph := float(i) / HALF_LO * PI * 0.5
		var x := w * pow(cos(ph), 2.0 / 4.5)
		var y := ys - (ys - yb) * pow(sin(ph), 2.0 / 3.2)
		pts.append(Vector2(x, y))
	return pts

func _arch(p: Vector3) -> Vector3:
	for ax in [[axle_f, rf], [axle_r, rr]]:
		var za: float = ax[0]
		var r: float = ax[1]
		var cy := r + 0.015
		var rad := r + 0.075
		if absf(p.x) < 0.58:
			continue
		var d := Vector2(p.z - za, p.y - cy)
		if d.length() < rad:
			if d.length() < 1e-4:
				d = Vector2(0, 1)
			var k := smoothstep(0.58, 0.72, absf(p.x))
			var q := d.normalized() * rad
			var np := Vector3(p.x, cy + lerpf(d.y, q.y, k), za + lerpf(d.x, q.x, k))
			return np
	return p

func _in_arch(p: Vector3) -> bool:
	for ax in [[axle_f, rf], [axle_r, rr]]:
		var za: float = ax[0]
		var r: float = ax[1]
		if absf(p.x) < 0.66:
			continue
		if Vector2(p.z - za, p.y - (r + 0.015)).length() < r + 0.07:
			return true
	return false

func _pocket(p: Vector3) -> Vector3:
	if p.z < tail + 0.3 and absf(p.x) < 0.52 and p.y < 0.43:
		var k := smoothstep(0.52, 0.47, absf(p.x)) * smoothstep(0.43, 0.39, p.y)
		p.z = lerpf(p.z, maxf(p.z, tail + 0.26), k)
	if p.z > nose - 0.25 and absf(p.x) < 0.37 and p.y > 0.17 and p.y < 0.37:
		var k2 := smoothstep(0.37, 0.33, absf(p.x)) * smoothstep(0.17, 0.2, p.y) * smoothstep(0.37, 0.34, p.y)
		p.z = lerpf(p.z, minf(p.z, nose - 0.2), k2)
	return p

func _grid_normals(g: Array, rows: int, cols: int, closed_cols: bool, flip := false) -> Array:
	var ns := []
	for i in rows:
		var row := []
		for j in cols:
			var p: Vector3 = g[i][j]
			var i0 := maxi(i - 1, 0)
			var i1 := mini(i + 1, rows - 1)
			var j0 := j - 1
			var j1 := j + 1
			if closed_cols:
				j0 = (j0 + cols) % cols
				j1 = j1 % cols
			else:
				j0 = maxi(j0, 0)
				j1 = mini(j1, cols - 1)
			var du: Vector3 = g[i1][j] - g[i0][j]
			var dv: Vector3 = g[i][j1] - g[i][j0]
			var n := du.cross(dv)
			if flip:
				n = -n
			if n.length() < 1e-9:
				n = Vector3(signf(p.x) if absf(p.x) > 0.01 else 0.0, 0.3, 0.0)
			row.append(n.normalized())
		ns.append(row)
	return ns

func _body_panel(c: Vector3, st: Dictionary) -> String:
	if c.y < st.yb + 0.035 and absf(c.x) < 0.75:
		return "Underbody"
	if c.z > nose - 0.33 and c.y < st.yc - 0.02:
		return "Bumper_F"
	if c.z < tail + 0.34 and c.y < st.ys + 0.05:
		return "Bumper_R"
	if absf(c.x) > 0.55 and c.z > -0.52 and c.z < 0.74 and c.y > 0.22 and c.y < st.yc - 0.01:
		return "Door_L" if c.x > 0.0 else "Door_R"
	return "Body_Shell"

func _build_body() -> void:
	P_W_s = _scale_tab(P_W)
	P_YB_s = _scale_tab(P_YB)
	P_YS_s = _scale_tab(P_YS)
	P_YC_s = _scale_tab(P_YC)
	P_XC_s = _scale_tab(P_XC)
	P_YT_s = _scale_tab(P_YT)
	P_ROOF_s = P_ROOF
	var zs := []
	for i in NZ + 1:
		zs.append(_zmap(float(i) / NZ))
	var half := HALF_UP + HALF_LO + 1
	var cols := half * 2 - 1
	var g := []
	var raw := []
	for i in zs.size():
		var z: float = zs[i]
		var st := _station(z)
		var hp := _ring_half(st)
		var row := []
		var rrow := []
		for j in hp.size():
			var p := Vector3(hp[j].x, hp[j].y, z)
			rrow.append(p)
			row.append(_pocket(_arch(p)))
		for j in range(hp.size() - 2, -1, -1):
			var p2 := Vector3(-hp[j].x, hp[j].y, z)
			rrow.append(p2)
			row.append(_pocket(_arch(p2)))
		g.append(row)
		raw.append(rrow)
	var ns := _grid_normals(g, zs.size(), cols, false)
	for i in zs.size() - 1:
		for j in cols - 1:
			var rc: Vector3 = (raw[i][j] + raw[i + 1][j + 1]) * 0.5
			if _in_arch(raw[i][j]) and _in_arch(raw[i + 1][j]) and _in_arch(raw[i][j + 1]) and _in_arch(raw[i + 1][j + 1]):
				continue
			var stc := _station(rc.z)
			var pn := _body_panel(rc, stc)
			var mat := "Paint"
			var jl := j if j < half - 1 else cols - 2 - j
			var frac := float(jl) / float(half - 1)
			var low_frac := float(HALF_UP + HALF_LO * 0.62) / float(HALF_UP + HALF_LO)
			if pn == "Underbody":
				mat = "Underbody"
			elif rc.z > nose - 0.3 and frac > low_frac:
				mat = "Paint_Black"
			elif rc.z < tail + 0.32 and frac > low_frac - 0.04:
				mat = "Carbon"
			elif frac > float(HALF_UP + HALF_LO * 0.86) / float(HALF_UP + HALF_LO) and absf(rc.z) < 1.2:
				mat = "Paint_Black"
			_quad(pn, mat, g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j], ns[i][j], ns[i][j + 1], ns[i + 1][j + 1], ns[i + 1][j])
			if rc.z > Z_RG - 0.05 and rc.z < Z_WS + 0.3 and not _in_arch(rc):
				var ins := 0.03
				var a0: Vector3 = g[i][j] - ns[i][j] * ins
				var a1: Vector3 = g[i][j + 1] - ns[i][j + 1] * ins
				var a2: Vector3 = g[i + 1][j + 1] - ns[i + 1][j + 1] * ins
				var a3: Vector3 = g[i + 1][j] - ns[i + 1][j] * ins
				var ipn := "Interior"
				if pn == "Door_L" or pn == "Door_R":
					ipn = pn
				_quad(ipn, "Interior_Dark" if rc.y > 0.3 else "Interior_Dark", a0, a1, a2, a3, -ns[i][j], -ns[i][j + 1], -ns[i + 1][j + 1], -ns[i + 1][j])
	var tz := []
	for i in zs.size():
		var z: float = zs[i]
		if z >= Z_WS + 0.01 or z <= Z_RG - 0.01:
			tz.append(z)
	tz.append(Z_WS)
	tz.append(Z_RG)
	tz.sort()
	var tzu := []
	for z in tz:
		if tzu.is_empty() or absf(z - tzu[tzu.size() - 1]) > 1e-4:
			tzu.append(z)
	tz = tzu
	var tg := []
	for z in tz:
		var st2 := _station(z)
		var row2 := []
		for j in TOP_SEG + 1:
			var u := float(j) / TOP_SEG
			var x: float = lerpf(st2.xc, -st2.xc, u)
			var xn := x / maxf(st2.xc, 0.01)
			var crown := 0.5 + 0.5 * cos(clampf(xn, -1.0, 1.0) * PI)
			var y: float = st2.yc + (st2.yt - st2.yc) * crown
			row2.append(Vector3(x, y, z))
		tg.append(row2)
	var tn := _grid_normals(tg, tz.size(), TOP_SEG + 1, false, true)
	for i in tz.size() - 1:
		var za: float = tz[i]
		var zb: float = tz[i + 1]
		if za <= Z_RG + 0.02 and zb >= Z_WS - 0.02:
			continue
		for j in TOP_SEG:
			var c: Vector3 = (tg[i][j] + tg[i + 1][j + 1]) * 0.5
			var pn2 := "Body_Shell"
			if c.z > Z_WS + 0.02 and c.z < nose - 0.3 and absf(c.x) < 0.6:
				pn2 = "Hood"
			elif c.z > nose - 0.3:
				pn2 = "Bumper_F"
			_quad(pn2, "Paint", tg[i][j], tg[i + 1][j], tg[i + 1][j + 1], tg[i][j + 1], tn[i][j], tn[i + 1][j], tn[i + 1][j + 1], tn[i][j + 1])
	_cap(g[0] + _rev(tg[0]), ns, true)
	_cap(g[zs.size() - 1] + _rev(tg[tz.size() - 1]), ns, false)
	_set_pivot("Hood", Vector3(0, 0.80, Z_WS))
	_set_pivot("Door_L", Vector3(0.97, 0.55, 0.74))
	_set_pivot("Door_R", Vector3(-0.97, 0.55, 0.74))

func _rev(a: Array) -> Array:
	var o := a.duplicate()
	o.reverse()
	return o

func _cap(ring: Array, _ns: Array, is_tail: bool) -> void:
	var c := Vector3.ZERO
	for p in ring:
		c += p
	c /= ring.size()
	var n := Vector3(0, 0, -1) if is_tail else Vector3(0, 0, 1)
	for j in ring.size() - 1:
		var a: Vector3 = ring[j]
		var b: Vector3 = ring[j + 1]
		var pn := "Bumper_R" if is_tail else "Bumper_F"
		var mat := "Paint"
		if not is_tail and (a.y + b.y) * 0.5 < 0.36:
			mat = "Paint_Black"
		if is_tail and (a.y + b.y) * 0.5 < 0.42:
			mat = "Carbon"
		if is_tail:
			_tri(pn, mat, c, b, a, n, n, n)
		else:
			_tri(pn, mat, c, a, b, n, n, n)

func _roof_y(z: float) -> float:
	return interp(P_ROOF_s, z)

func _build_canopy() -> void:
	var zs := []
	var n := 70
	for i in n + 1:
		zs.append(lerpf(Z_RG, Z_WS, float(i) / n))
	var g := []
	for z in zs:
		var st := _station(z)
		var yr := _roof_y(z)
		var row := []
		for j in CAN_SEG + 1:
			var u := float(j) / CAN_SEG
			var ang := u * PI
			var c := cos(ang)
			var s := sin(ang)
			var hx: float = st.xc * 0.985
			var x := hx * signf(c) * pow(absf(c), 2.0 / 2.1)
			var y: float = st.yc + (yr - st.yc) * pow(s, 2.0 / 2.6)
			var tumble: float = (y - float(st.yc)) * 0.16 * signf(x)
			row.append(Vector3(x - tumble, y, z))
		g.append(row)
	var ns := _grid_normals(g, zs.size(), CAN_SEG + 1, false, true)
	for i in zs.size() - 1:
		for j in CAN_SEG:
			var a: Vector3 = g[i][j]
			var b: Vector3 = g[i + 1][j]
			var c2: Vector3 = g[i + 1][j + 1]
			var d: Vector3 = g[i][j + 1]
			var cen := (a + c2) * 0.5
			var u := (float(j) + 0.5) / CAN_SEG
			var side := u < 0.2 or u > 0.8
			var nm := "Glass_Windshield"
			if side:
				var left := u < 0.5
				if cen.z > 0.68:
					nm = "Glass_Windshield"
				elif cen.z > -0.5:
					nm = "Glass_Door_L" if left else "Glass_Door_R"
				else:
					nm = "Glass_Quarter_L" if left else "Glass_Quarter_R"
			else:
				if cen.z > -0.02:
					nm = "Glass_Windshield"
				elif cen.z > -0.78:
					nm = "Roof_Targa"
				else:
					nm = "Glass_Rear"
			var frame := false
			if not side and absf(cen.z - (-0.02)) < 0.045:
				frame = true
			if side and absf(cen.z - 0.68) < 0.03 and cen.y > 0.86:
				frame = true
			if frame:
				_quad("Body_Shell", "Paint_Black", a, b, c2, d, ns[i][j], ns[i + 1][j], ns[i + 1][j + 1], ns[i][j + 1])
				continue
			var mat := "Glass_Tint"
			_quad(nm, mat, a, b, c2, d, ns[i][j], ns[i + 1][j], ns[i + 1][j + 1], ns[i][j + 1])
	_set_pivot("Glass_Door_L", Vector3(0.97, 0.55, 0.74), "Door_L")
	_set_pivot("Glass_Door_R", Vector3(-0.97, 0.55, 0.74), "Door_R")
	_set_pivot("Roof_Targa", Vector3(0, 1.1, -0.4))

func _revolve(node_name: String, mat: String, profile: PackedVector2Array, segs: int, offset: Vector3, xdir: float, center := Vector2(0, -1)) -> void:
	var pn := []
	for j in profile.size():
		var a := profile[maxi(j - 1, 0)]
		var b := profile[mini(j + 1, profile.size() - 1)]
		var tg := (b - a).normalized()
		var n2 := Vector2(-tg.y, tg.x)
		var ref := profile[j] - center if center.y >= 0.0 else Vector2(0, 1)
		if n2.dot(ref) < 0.0:
			n2 = -n2
		pn.append(n2)
	for k in segs:
		var a0 := float(k) / segs * TAU
		var a1 := float(k + 1) / segs * TAU
		for j in profile.size() - 1:
			var p0 := profile[j]
			var p1 := profile[j + 1]
			var q := []
			var nq := []
			for ang in [a0, a1]:
				for jj in [j, j + 1]:
					var pp := profile[jj]
					q.append(offset + Vector3(pp.x * xdir, pp.y * sin(ang), pp.y * cos(ang)))
					var nn: Vector2 = pn[jj]
					nq.append(Vector3(nn.x * xdir, nn.y * sin(ang), nn.y * cos(ang)).normalized())
			_quad(node_name, mat, q[0], q[1], q[3], q[2], nq[0], nq[1], nq[3], nq[2])

func _build_wheels() -> void:
	var w: Dictionary = t["wheels"]
	var c: Dictionary = t["car"]
	var s: Dictionary = t["suspension"]
	for corner in ["FL", "FR", "RL", "RR"]:
		var front: bool = corner[0] == "F"
		var left: bool = corner[1] == "L"
		var r := rf if front else rr
		var wid := float(w["width_front"]) if front else float(w["width_rear"])
		var tr := float(c["track_front"]) if front else float(c["track_rear"])
		var hub := Vector3((1.0 if left else -1.0) * tr * 0.5, r, axle_f if front else axle_r)
		var out := 1.0 if left else -1.0
		var side_h := r - (0.254 if front else 0.2667)
		var ri := r - side_h
		var tyre := PackedVector2Array()
		var hw := wid * 0.5
		var bulge := 0.012
		var steps := 14
		for k in steps + 1:
			var a := float(k) / steps * PI
			var x := -hw * cos(a) * (1.0 + bulge)
			var y := ri + 0.006 + (r - ri - 0.006) * pow(sin(a), 0.32)
			if k == 0 or k == steps:
				y = ri + 0.004
			tyre.append(Vector2(x, y))
		var wname: String = "Wheel_" + corner
		_revolve("Tire_" + corner, "Tire", tyre, 72, hub, out, Vector2(0.0, (ri + r) * 0.5))
		var rim := PackedVector2Array([Vector2(-hw * 0.98, ri - 0.005), Vector2(-hw * 0.9, ri + 0.012), Vector2(-hw * 0.6, ri - 0.012), Vector2(hw * 0.55, ri - 0.012), Vector2(hw * 0.86, ri + 0.008), Vector2(hw * 0.98, ri + 0.004), Vector2(hw * 0.99, ri - 0.014)])
		_revolve("Rim_" + corner, "Rim", rim, 48, hub, out, Vector2(0.0, 0.0))
		var face_x := hw * 0.72
		var spokes := 10
		for k in spokes:
			var a0 := float(k) / spokes * TAU
			for half in [-1.0, 1.0]:
				var aa: float = a0 + half * 0.07
				var ab: float = a0 + half * 0.025
				var p_in := Vector3(face_x * out - 0.035 * out, 0.075 * sin(ab), 0.075 * cos(ab))
				var p_out := Vector3(face_x * out, (ri - 0.01) * sin(aa), (ri - 0.01) * cos(aa))
				var p_in2 := Vector3(face_x * out - 0.035 * out, 0.075 * sin(a0), 0.075 * cos(a0))
				var p_out2 := Vector3(face_x * out - 0.012 * out, (ri - 0.01) * sin(a0), (ri - 0.01) * cos(a0))
				var nrm := Vector3(out, 0, 0)
				if half > 0.0:
					_quad("Rim_" + corner, "Rim", hub + p_in, hub + p_out, hub + p_out2, hub + p_in2, nrm, nrm, nrm, nrm)
				else:
					_quad("Rim_" + corner, "Rim", hub + p_in, hub + p_in2, hub + p_out2, hub + p_out, nrm, nrm, nrm, nrm)
			var mid := a0
			var sn := Vector3(out * 0.5, sin(mid), cos(mid)).normalized()
			var e0 := Vector3(face_x * out - 0.035 * out, 0.075 * sin(mid), 0.075 * cos(mid))
			var e1 := Vector3(face_x * out - 0.012 * out, (ri - 0.01) * sin(mid), (ri - 0.01) * cos(mid))
			var back0 := e0 - Vector3(0.05 * out, 0, 0)
			var back1 := e1 - Vector3(0.05 * out, 0, 0)
			_quad("Rim_" + corner, "Rim", hub + e0, hub + e1, hub + back1, hub + back0, sn, sn, sn, sn)
		var hubp := PackedVector2Array([Vector2(face_x - 0.03, 0.0), Vector2(face_x - 0.025, 0.05), Vector2(face_x - 0.04, 0.08), Vector2(face_x - 0.09, 0.085)])
		_revolve("Rim_" + corner, "Rim", hubp, 24, hub, out, Vector2(-1.0, 0.0))
		var disc := PackedVector2Array([Vector2(hw * 0.1, 0.06), Vector2(hw * 0.1, 0.2), Vector2(-hw * 0.12, 0.2), Vector2(-hw * 0.12, 0.06)])
		_revolve("Brake_" + corner, "Brake_Disc", disc, 40, hub, out, Vector2(0.0, 0.13))
		var cal_a := 0.35 if front else PI - 0.35
		var cal_c := hub + Vector3(out * hw * 0.02, 0.19 * sin(cal_a + PI * 0.5), 0.19 * cos(cal_a + PI * 0.5))
		_box("Brake_" + corner, "Caliper", cal_c, Vector3(0.07, 0.12, 0.05), Basis(Vector3.RIGHT, -(cal_a + PI * 0.5)))
		_set_pivot("Tire_" + corner, hub, wname)
		_set_pivot("Rim_" + corner, hub, wname)
		var liner_r := r + 0.07
		var liner := []
		for k in 25:
			var a := lerpf(-0.35, PI + 0.35, float(k) / 24.0)
			liner.append(Vector2(cos(a), sin(a)))
		var x_out := hub.x + out * (hw - 0.01)
		var x_in := hub.x - out * (hw + 0.12)
		for k in 24:
			var p0: Vector2 = liner[k]
			var p1: Vector2 = liner[k + 1]
			var cy := r + 0.015
			var a0v := Vector3(x_out, cy + p0.y * liner_r, hub.z + p0.x * liner_r)
			var a1v := Vector3(x_out, cy + p1.y * liner_r, hub.z + p1.x * liner_r)
			var b0v := Vector3(x_in, cy + p0.y * liner_r, hub.z + p0.x * liner_r)
			var b1v := Vector3(x_in, cy + p1.y * liner_r, hub.z + p1.x * liner_r)
			var nn0 := Vector3(0, -p0.y, -p0.x)
			var nn1 := Vector3(0, -p1.y, -p1.x)
			if out > 0.0:
				_quad("Body_Shell", "Underbody", a0v, b0v, b1v, a1v, nn0, nn0, nn1, nn1)
			else:
				_quad("Body_Shell", "Underbody", a0v, a1v, b1v, b0v, nn0, nn1, nn1, nn0)

func _box(node_name: String, mat: String, c: Vector3, size: Vector3, b: Basis = Basis.IDENTITY) -> void:
	var h := size * 0.5
	var faces := [
		[Vector3(1, 0, 0), Vector3(0, 1, 0), Vector3(0, 0, 1)],
		[Vector3(-1, 0, 0), Vector3(0, 0, 1), Vector3(0, 1, 0)],
		[Vector3(0, 1, 0), Vector3(0, 0, 1), Vector3(1, 0, 0)],
		[Vector3(0, -1, 0), Vector3(1, 0, 0), Vector3(0, 0, 1)],
		[Vector3(0, 0, 1), Vector3(1, 0, 0), Vector3(0, 1, 0)],
		[Vector3(0, 0, -1), Vector3(0, 1, 0), Vector3(1, 0, 0)],
	]
	for f in faces:
		var n: Vector3 = f[0]
		var u: Vector3 = f[1]
		var v: Vector3 = f[2]
		var cc := n * h
		var uu := u * h
		var vv := v * h
		var p0 := c + b * (cc - uu - vv)
		var p1 := c + b * (cc + uu - vv)
		var p2 := c + b * (cc + uu + vv)
		var p3 := c + b * (cc - uu + vv)
		var nw := b * n
		_quad(node_name, mat, p0, p1, p2, p3, nw, nw, nw, nw)

func _cyl(node_name: String, mat: String, a: Vector3, b: Vector3, r0: float, r1: float, segs: int, caps := true) -> void:
	var axis := (b - a).normalized()
	var ref := Vector3.UP if absf(axis.y) < 0.9 else Vector3.RIGHT
	var u := axis.cross(ref).normalized()
	var v := axis.cross(u).normalized()
	for k in segs:
		var a0 := float(k) / segs * TAU
		var a1 := float(k + 1) / segs * TAU
		var d0 := u * cos(a0) + v * sin(a0)
		var d1 := u * cos(a1) + v * sin(a1)
		_quad(node_name, mat, a + d0 * r0, a + d1 * r0, b + d1 * r1, b + d0 * r1, d0, d1, d1, d0)
		if caps:
			_tri(node_name, mat, b, b + d0 * r1, b + d1 * r1, axis, axis, axis)
			_tri(node_name, mat, a, a + d1 * r0, a + d0 * r0, -axis, -axis, -axis)

func _build_nozzles() -> void:
	var th: Dictionary = t["thrusters"]
	var names_r := ["Nozzle_RL1", "Nozzle_RL2", "Nozzle_RR2", "Nozzle_RR1"]
	var rp: Array = th["rear"]["positions"]
	for i in rp.size():
		var p := Vector3(float(rp[i][0]), float(rp[i][1]), float(rp[i][2]))
		var nm: String = names_r[i]
		_nozzle_geo(nm, p, Vector3(0, 0, -1), 0.155, 0.05, 0.062)
		_set_pivot(nm, p)
	var fp: Array = th["front"]["positions"]
	var names_f := ["Nozzle_FL", "Nozzle_FR"]
	for i in fp.size():
		var p := Vector3(float(fp[i][0]), float(fp[i][1]), float(fp[i][2]))
		var nm: String = names_f[i]
		_nozzle_geo(nm, p, Vector3(0, 0, 1), 0.06, 0.035, 0.046)
		_set_pivot(nm, p, "NozzleMount_F")
	var fx := absf(float(fp[0][0]))
	var fy := float(fp[0][1])
	var fz := nose - 0.205
	var flap_top := fy + 0.085
	var flap_bot := fy - 0.075
	var hw := fx + 0.11
	var n := Vector3(0, 0.15, 1).normalized()
	_quad("Flap_F", "Paint_Black", Vector3(-hw, flap_bot, nose - 0.02), Vector3(hw, flap_bot, nose - 0.02), Vector3(hw, flap_top, nose - 0.035), Vector3(-hw, flap_top, nose - 0.035), n, n, n, n)
	_quad("Flap_F", "Paint_Black", Vector3(-hw, flap_top, nose - 0.035), Vector3(hw, flap_top, nose - 0.035), Vector3(hw, flap_bot, nose - 0.02), Vector3(-hw, flap_bot, nose - 0.02), -n, -n, -n, -n)
	_set_pivot("Flap_F", Vector3(0, flap_top, nose - 0.035))
	_box("Diffuser", "Carbon", Vector3(0, 0.43, tail + 0.13), Vector3(1.08, 0.025, 0.26))
	for x in [-0.53, 0.53]:
		_box("Diffuser", "Carbon", Vector3(x, 0.3, tail + 0.14), Vector3(0.025, 0.26, 0.26))
	_box("Diffuser", "Carbon", Vector3(0, 0.29, tail + 0.27), Vector3(1.06, 0.26, 0.02))
	_box("Diffuser", "Carbon", Vector3(0, 0.22, nose - 0.11), Vector3(0.74, 0.02, 0.18))
	_box("Diffuser", "Carbon", Vector3(0, 0.36, nose - 0.11), Vector3(0.74, 0.02, 0.18))
	_box("Diffuser", "Carbon", Vector3(0, 0.29, nose - 0.2), Vector3(0.74, 0.16, 0.02))

func _nozzle_geo(nm: String, pivot: Vector3, ax: Vector3, length: float, r0: float, r1: float) -> void:
	var a := pivot - ax * 0.03
	var b := pivot + ax * length * 0.75
	var c := pivot + ax * length
	_cyl(nm, "Nozzle_Metal", a, b, r0, r0 * 0.94, 24, false)
	_cyl(nm, "Nozzle_Metal", b, c, r0 * 0.94, r1, 24, false)
	_cyl(nm, "Nozzle_Inner", c - ax * 0.002, b, r1 * 0.9, r0 * 0.7, 24, false)
	_cyl(nm, "Nozzle_Metal", pivot - ax * 0.05, pivot, r0 * 1.15, r0 * 1.15, 18, true)

func _build_lights() -> void:
	for side in [1.0, -1.0]:
		var nm := "Light_Head_L" if side > 0.0 else "Light_Head_R"
		var pts := []
		var steps := 16
		for k in steps + 1:
			var u := float(k) / steps
			var z := lerpf(nose - 0.34, nose - 0.08, u)
			var st := _station(z)
			var x: float = lerpf(st.w * 0.93, st.w * 0.62, u * u)
			var y: float = lerpf(st.ys + 0.035, st.ys + 0.005, u)
			pts.append(Vector3(x * side, y, z))
		for k in steps:
			var p0: Vector3 = pts[k]
			var p1: Vector3 = pts[k + 1]
			var out := Vector3(side, 0.15, 0.6).normalized()
			var up := Vector3(0, 0.028, 0)
			var o := out * 0.006
			_quad(nm, "LED_Head", p0 + o, p1 + o, p1 + up + o, p0 + up + o, out, out, out, out)
			var lo := out * 0.012
			_quad(nm, "Lens", p0 + lo - up * 0.6, p1 + lo - up * 0.6, p1 + up * 1.6 + lo, p0 + up * 1.6 + lo, out, out, out, out)
	var tpts := []
	var ts := 30
	for k in ts + 1:
		var u := float(k) / ts
		var x := lerpf(-1.0, 1.0, u)
		var z := tail
		var st2 := _station(tail + 0.02)
		tpts.append(Vector3(x * st2.w * 0.84, st2.yc - 0.07, z - 0.006 - 0.02 * x * x))
	for k in ts:
		var p0: Vector3 = tpts[k]
		var p1: Vector3 = tpts[k + 1]
		var n := Vector3(0, 0.1, -1).normalized()
		var h := Vector3(0, 0.022, 0)
		_quad("Light_Tail", "LED_Tail", p1, p0, p0 + h, p1 + h, n, n, n, n)

func _build_details() -> void:
	for side in [1.0, -1.0]:
		var nm := "Mirror_L" if side > 0.0 else "Mirror_R"
		var door := "Door_L" if side > 0.0 else "Door_R"
		var base := Vector3(side * 0.79, 0.855, 0.6)
		_cyl(nm, "Paint_Black", base, base + Vector3(side * 0.13, 0.04, -0.03), 0.011, 0.011, 8)
		_box(nm, "Paint", base + Vector3(side * 0.17, 0.06, -0.04), Vector3(0.11, 0.055, 0.07), Basis(Vector3.UP, side * 0.25))
		_set_pivot(nm, base, door)
	var w_y := 1.0
	_box("Wing", "Carbon", Vector3(0, w_y, tail + 0.2), Vector3(1.86, 0.02, 0.26), Basis(Vector3.RIGHT, 0.12))
	for x in [-0.93, 0.93]:
		_box("Wing", "Carbon", Vector3(x, w_y - 0.02, tail + 0.2), Vector3(0.012, 0.22, 0.32))
	for x in [-0.42, 0.42]:
		_box("Wing", "Carbon", Vector3(x, w_y - 0.07, tail + 0.28), Vector3(0.018, 0.16, 0.08), Basis(Vector3.RIGHT, -0.4))

func _build_interior() -> void:
	var I := "Interior"
	_box(I, "Interior_Dark", Vector3(0, 0.16, -0.25), Vector3(1.5, 0.03, 2.2))
	for side in [1.0, -1.0]:
		var sx: float = side * 0.38
		_seat(I, Vector3(sx, 0.2, -0.42), 1.0)
		_seat(I, Vector3(side * 0.33, 0.28, -1.0), 0.78)
		_box(I, "Interior_Leather", Vector3(side * 0.86, 0.55, 0.1), Vector3(0.05, 0.42, 1.2))
		_box(I, "Interior_Dark", Vector3(side * 0.85, 0.74, 0.1), Vector3(0.08, 0.05, 1.2))
	_box(I, "Interior_Dark", Vector3(0, 0.3, -0.25), Vector3(0.24, 0.3, 1.25))
	_box(I, "Interior_Dark", Vector3(0, 0.62, 0.62), Vector3(1.62, 0.34, 0.55), Basis(Vector3.RIGHT, -0.05))
	_box(I, "Alcantara", Vector3(0, 0.8, 0.55), Vector3(1.56, 0.04, 0.62), Basis(Vector3.RIGHT, 0.1))
	_box(I, "Interior_Dark", Vector3(0, 0.75, -1.3), Vector3(1.5, 0.28, 0.1))
	_box(I, "Interior_Dark", Vector3(0.38, 0.62, 0.25), Vector3(0.06, 0.06, 0.4), Basis(Vector3.RIGHT, -0.45))
	var col := Vector3(0.38, 0.66, 0.06)
	var wbasis := Basis(Vector3.RIGHT, -0.42)
	var rim := PackedVector2Array()
	for k in 13:
		var a := float(k) / 12.0 * TAU
		rim.append(Vector2(0.018 * cos(a), 0.17 + 0.018 * sin(a)))
	var segs := 40
	for k in segs:
		var a0 := float(k) / segs * TAU
		var a1 := float(k + 1) / segs * TAU
		for j in rim.size() - 1:
			var p := []
			for aa in [a0, a1]:
				for q in [rim[j], rim[j + 1]]:
					var lp := Vector3(q.y * cos(aa), q.y * sin(aa), q.x)
					p.append(col + wbasis * lp)
			var nn := []
			for aa in [a0, a1]:
				for q in [rim[j], rim[j + 1]]:
					var ctr := Vector3(0.17 * cos(aa), 0.17 * sin(aa), 0.0)
					var lp2 := Vector3(q.y * cos(aa), q.y * sin(aa), q.x)
					nn.append((wbasis * (lp2 - ctr)).normalized())
			_quad("SteeringWheel", "Alcantara", p[0], p[2], p[3], p[1], nn[0], nn[2], nn[3], nn[1])
	_box("SteeringWheel", "Interior_Dark", col + wbasis * Vector3(0, 0, 0.02), Vector3(0.1, 0.08, 0.04), wbasis)
	for a in [0.0, PI, -PI * 0.5]:
		var d := Vector3(cos(a), sin(a), 0.0)
		_cyl("SteeringWheel", "Interior_Dark", col + wbasis * (d * 0.04), col + wbasis * (d * 0.16), 0.012, 0.012, 8, false)
	_set_pivot("SteeringWheel", col)
	pivot_basis["SteeringWheel"] = wbasis
	grips = [col + wbasis * Vector3(0.17, 0.0, 0.0), col + wbasis * Vector3(-0.17, 0.0, 0.0)]
	var sc := Vector3(0.0, 0.79, 0.34)
	var sb := Basis(Vector3.UP, 0.0) * Basis(Vector3.RIGHT, -0.52)
	var sw := 0.36
	var sh := sw / 1.6
	_screen_quad("Screen", "Screen", sc, sb, sw, sh)
	_box("Screen", "Interior_Dark", sc + sb * Vector3(0, 0, 0.014), Vector3(sw + 0.02, sh + 0.02, 0.02), sb)
	_set_pivot("Screen", sc)
	var cc := Vector3(0.38, 0.815, 0.36)
	var cb := Basis(Vector3.RIGHT, -0.45)
	_screen_quad("Cluster", "Cluster", cc, cb, 0.2, 0.2 / 2.4)
	_box("Cluster", "Interior_Dark", cc + cb * Vector3(0, 0, 0.012), Vector3(0.22, 0.1, 0.015), cb)
	_set_pivot("Cluster", cc)

func _screen_quad(nm: String, mat: String, c: Vector3, b: Basis, w: float, h: float) -> void:
	var n := b * Vector3(0, 0, -1)
	var ex := b * Vector3(1, 0, 0) * w * 0.5
	var ey := b * Vector3(0, 1, 0) * h * 0.5
	var p0 := c + ex - ey
	var p1 := c - ex - ey
	var p2 := c - ex + ey
	var p3 := c + ex + ey
	_tri(nm, mat, p0, p2, p1, n, n, n, Vector2(0, 1), Vector2(1, 0), Vector2(1, 1))
	_tri(nm, mat, p0, p3, p2, n, n, n, Vector2(0, 1), Vector2(0, 0), Vector2(1, 0))

func _seat(nm: String, base: Vector3, s: float) -> void:
	_box(nm, "Interior_Leather", base + Vector3(0, 0.06, 0.05) * s, Vector3(0.5, 0.1, 0.5) * s, Basis(Vector3.RIGHT, -0.12))
	var back := Basis(Vector3.RIGHT, 0.38)
	_box(nm, "Interior_Leather", base + Vector3(0, 0.36, -0.24) * s, Vector3(0.5, 0.62, 0.11) * s, back)
	for side in [-1.0, 1.0]:
		_box(nm, "Interior_Leather", base + Vector3(side * 0.24, 0.32, -0.18) * s, Vector3(0.07, 0.5, 0.14) * s, back)
	_box(nm, "Interior_Dark", base + Vector3(0, 0.74, -0.36) * s, Vector3(0.26, 0.2, 0.09) * s, back)

func _build_anchors() -> void:
	var anchors := {
		"Seat_Driver": Vector3(0.38, 0.30, -0.38),
		"Eye_Driver": Vector3(0.38, 0.97, -0.44),
		"COM": Tuning.v3("car", "com"),
		"Cam_Chase": Vector3(0, 1.0, 0),
	}
	for k in anchors.keys():
		var n := Node3D.new()
		n.name = k
		n.position = anchors[k]
		root.add_child(n)
	var lamp := {
		"Lamp_Head_L": Vector3(0.75, 0.6, nose - 0.2),
		"Lamp_Head_R": Vector3(-0.75, 0.6, nose - 0.2),
		"Lamp_Tail": Vector3(0, 0.8, tail + 0.02),
	}
	for k in lamp.keys():
		var n2 := Node3D.new()
		n2.name = k
		n2.position = lamp[k]
		root.add_child(n2)
	var mount := Node3D.new()
	mount.name = "NozzleMount_F"
	root.add_child(mount)
	pivots["NozzleMount_F"] = Vector3.ZERO
	for corner in ["FL", "FR"]:
		var s := Node3D.new()
		s.name = "Steer_" + corner
		var front_hub := Vector3((1.0 if corner == "FL" else -1.0) * float(t["car"]["track_front"]) * 0.5, rf, axle_f)
		s.position = front_hub
		root.add_child(s)
		pivots["Steer_" + corner] = front_hub
	for corner in ["FL", "FR", "RL", "RR"]:
		var wn := Node3D.new()
		wn.name = "Wheel_" + corner
		var front: bool = corner[0] == "F"
		var tr := float(t["car"]["track_front"]) if front else float(t["car"]["track_rear"])
		var hub := Vector3((1.0 if corner[1] == "L" else -1.0) * tr * 0.5, rf if front else rr, axle_f if front else axle_r)
		pivots["Wheel_" + corner] = hub
		if front:
			wn.position = Vector3.ZERO
			root.get_node("Steer_" + corner).add_child(wn)
			_set_pivot("Brake_" + corner, hub, "Steer_" + corner)
		else:
			wn.position = hub
			root.add_child(wn)
			_set_pivot("Brake_" + corner, hub)
