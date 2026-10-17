// Lattice skinning: vertices follow a smooth displacement field resampled from the damage lattice into a 3D texture in the car frame; normals use the field's Jacobian.
uniform sampler3D deform_tex : filter_linear, repeat_disable;
uniform float lattice_on = 0.0;
uniform mat4 world_to_car = mat4(1.0);
uniform vec3 grid_min = vec3(-1.15, -0.15, -2.45);
uniform vec3 grid_size = vec3(2.3, 1.5, 4.9);

vec3 deform_sample(vec3 pc) {
	return texture(deform_tex, (pc - grid_min) / grid_size).xyz;
}

vec3 lattice_deform(inout vec3 vtx, inout vec3 nrm, mat4 model) {
	mat4 l2c = world_to_car * model;
	vec3 pc = (l2c * vec4(vtx, 1.0)).xyz;
	if (lattice_on < 0.5) {
		return pc;
	}
	vec3 d = deform_sample(pc);
	float e = 0.06;
	vec3 jx = (deform_sample(pc + vec3(e, 0.0, 0.0)) - d) / e;
	vec3 jy = (deform_sample(pc + vec3(0.0, e, 0.0)) - d) / e;
	vec3 jz = (deform_sample(pc + vec3(0.0, 0.0, e)) - d) / e;
	mat3 f = mat3(1.0) + mat3(jx, jy, jz);
	mat3 lc = mat3(l2c);
	mat3 cl = inverse(lc);
	vtx += cl * d;
	vec3 nc = transpose(inverse(f)) * (lc * nrm);
	nrm = normalize(cl * nc);
	return pc;
}
