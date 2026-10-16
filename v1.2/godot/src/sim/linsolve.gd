# LinSolve: tiny dense weighted least-squares with box bounds (active set), sized for the 6-nozzle allocator.
class_name LinSolve
extends RefCounted

static func solve(a: PackedFloat64Array, b: PackedFloat64Array, n: int) -> PackedFloat64Array:
	var m := a.duplicate()
	var x := b.duplicate()
	for col in n:
		var piv := col
		var best := absf(m[col * n + col])
		for r in range(col + 1, n):
			var v := absf(m[r * n + col])
			if v > best:
				best = v
				piv = r
		if best < 1e-12:
			continue
		if piv != col:
			for c in n:
				var tmp := m[col * n + c]
				m[col * n + c] = m[piv * n + c]
				m[piv * n + c] = tmp
			var tb := x[col]
			x[col] = x[piv]
			x[piv] = tb
		var d := m[col * n + col]
		for r in range(col + 1, n):
			var f := m[r * n + col] / d
			if f == 0.0:
				continue
			for c in range(col, n):
				m[r * n + c] -= f * m[col * n + c]
			x[r] -= f * x[col]
	var out := PackedFloat64Array()
	out.resize(n)
	for i in range(n - 1, -1, -1):
		var s := x[i]
		for c in range(i + 1, n):
			s -= m[i * n + c] * out[c]
		var d2 := m[i * n + i]
		out[i] = s / d2 if absf(d2) > 1e-12 else 0.0
	return out

static func bounded_wls(rows: Array, rhs: PackedFloat64Array, weights: PackedFloat64Array, lo: PackedFloat64Array, hi: PackedFloat64Array, eps: float, n: int) -> PackedFloat64Array:
	var x := PackedFloat64Array()
	x.resize(n)
	var fixed := PackedByteArray()
	fixed.resize(n)
	for i in n:
		if hi[i] - lo[i] < 1e-9:
			fixed[i] = 1
			x[i] = lo[i]
	var nr := rows.size()
	for it in 6:
		var free_idx := PackedInt32Array()
		for i in n:
			if fixed[i] == 0:
				free_idx.append(i)
		var nf := free_idx.size()
		if nf == 0:
			break
		var r2 := PackedFloat64Array()
		r2.resize(nr)
		for r in nr:
			var row: PackedFloat64Array = rows[r]
			var s := rhs[r]
			for i in n:
				if fixed[i] == 1:
					s -= row[i] * x[i]
			r2[r] = s
		var h := PackedFloat64Array()
		h.resize(nf * nf)
		var g := PackedFloat64Array()
		g.resize(nf)
		for r in nr:
			var row: PackedFloat64Array = rows[r]
			var w := weights[r]
			if w == 0.0:
				continue
			for p in nf:
				var ap := row[free_idx[p]] * w
				if ap == 0.0:
					continue
				g[p] += ap * r2[r]
				for q in nf:
					h[p * nf + q] += ap * row[free_idx[q]]
		for p in nf:
			h[p * nf + p] += eps
		var sol := solve(h, g, nf)
		var violated := false
		var worst := -1
		var worst_amt := 0.0
		for p in nf:
			var i := free_idx[p]
			var v := sol[p]
			x[i] = v
			var amt := 0.0
			if v < lo[i]:
				amt = lo[i] - v
			elif v > hi[i]:
				amt = v - hi[i]
			if amt > worst_amt:
				worst_amt = amt
				worst = i
		if worst < 0:
			break
		violated = true
		for p in nf:
			var i := free_idx[p]
			if x[i] < lo[i] - 1e-9:
				x[i] = lo[i]
				fixed[i] = 1
			elif x[i] > hi[i] + 1e-9:
				x[i] = hi[i]
				fixed[i] = 1
		if not violated:
			break
	for i in n:
		x[i] = clampf(x[i], lo[i], hi[i])
	return x
