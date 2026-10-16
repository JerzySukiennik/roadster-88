// Car glass: tinted, lighter from inside, radial cracks from up to four impact points, lattice deformation.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, specular_schlick_ggx;

#include "res://src/car/lattice_skin.gdshaderinc"

uniform vec4 tint : source_color = vec4(0.015, 0.018, 0.022, 0.8);
uniform float inside_alpha : hint_range(0.0, 1.0) = 0.18;
uniform float gloss : hint_range(0.0, 1.0) = 0.03;
uniform vec4 crack0 = vec4(0.0, 0.0, 0.0, 0.0);
uniform vec4 crack1 = vec4(0.0, 0.0, 0.0, 0.0);
uniform vec4 crack2 = vec4(0.0, 0.0, 0.0, 0.0);
uniform vec4 crack3 = vec4(0.0, 0.0, 0.0, 0.0);
uniform float frost : hint_range(0.0, 1.0) = 0.0;

varying vec3 v_car;

float h11(float x) {
	return fract(sin(x * 127.1) * 43758.5453);
}

float crack_at(vec3 p, vec4 c) {
	if (c.w <= 0.0) {
		return 0.0;
	}
	vec3 d = p - c.xyz;
	float r = length(d);
	float reach = 0.18 + c.w * 0.9;
	if (r > reach) {
		return 0.0;
	}
	vec3 ax = abs(d);
	vec2 q = ax.x < ax.y && ax.x < ax.z ? d.yz : (ax.y < ax.z ? d.xz : d.xy);
	float ang = atan(q.y, q.x);
	float spokes = 17.0 + floor(c.w * 9.0);
	float a = ang / 6.2831853 * spokes;
	float id = floor(a);
	float jitter = (h11(id + c.x * 31.0) - 0.5) * 0.5 + sin(r * 38.0 + id) * 0.08;
	float line = abs(fract(a) - 0.5 - jitter * 0.6);
	float lw = 0.035 + 0.05 * (1.0 - r / reach);
	float rad = 1.0 - smoothstep(lw * 0.5, lw, line * (0.4 + r * 3.0));
	rad *= step(h11(id * 3.1 + 2.0), 0.85 + c.w * 0.15);
	float ring_r = r * (9.0 + h11(id) * 3.0);
	float ring = 1.0 - smoothstep(0.0, 0.06, abs(fract(ring_r) - 0.5) - 0.44);
	ring *= step(0.45, h11(id + floor(ring_r) * 7.0)) * smoothstep(reach, reach * 0.3, r);
	float core = 1.0 - smoothstep(0.0, 0.03 + c.w * 0.03, r);
	float fade = 1.0 - smoothstep(reach * 0.55, reach, r);
	return clamp((max(rad, ring * 0.8) * fade + core) * min(1.0, c.w * 1.5), 0.0, 1.0);
}

void vertex() {
	v_car = lattice_deform(VERTEX, NORMAL, MODEL_MATRIX);
}

void fragment() {
	float cr = crack_at(v_car, crack0);
	cr = max(cr, crack_at(v_car, crack1));
	cr = max(cr, crack_at(v_car, crack2));
	cr = max(cr, crack_at(v_car, crack3));
	float a = FRONT_FACING ? tint.a : inside_alpha;
	vec3 col = tint.rgb;
	col = mix(col, vec3(0.75, 0.78, 0.8), cr * 0.8);
	col = mix(col, vec3(0.8, 0.85, 0.9), frost * 0.6);
	ALBEDO = col;
	ALPHA = clamp(a + cr * 0.65 + frost * 0.5, 0.0, 1.0);
	ROUGHNESS = mix(gloss, 0.5, max(cr, frost));
	METALLIC = 0.0;
	SPECULAR = 0.6;
}
