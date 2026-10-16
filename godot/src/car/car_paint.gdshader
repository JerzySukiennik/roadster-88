// Car paint: multi-coat base with metallic flake, clearcoat, lattice deformation, frost and time-travel ice.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

#include "res://src/car/lattice_skin.gdshaderinc"

uniform vec4 base_color : source_color = vec4(0.55, 0.015, 0.02, 1.0);
uniform vec4 deep_color : source_color = vec4(0.18, 0.0, 0.01, 1.0);
uniform vec4 flake_color : source_color = vec4(1.0, 0.45, 0.4, 1.0);
uniform float metallic_amt : hint_range(0.0, 1.0) = 0.25;
uniform float base_roughness : hint_range(0.0, 1.0) = 0.32;
uniform float flake_amount : hint_range(0.0, 1.0) = 0.55;
uniform float flake_scale = 900.0;
uniform float clearcoat_rough : hint_range(0.0, 1.0) = 0.02;
uniform float frost : hint_range(0.0, 1.0) = 0.0;
uniform float ice : hint_range(0.0, 1.0) = 0.0;
uniform float dirt : hint_range(0.0, 1.0) = 0.0;

varying vec3 v_car;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
	p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
	return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void vertex() {
	v_car = lattice_deform(VERTEX, NORMAL, MODEL_MATRIX);
}

void fragment() {
	vec3 n_view = normalize(NORMAL);
	float ndv = clamp(dot(n_view, VIEW), 0.0, 1.0);
	float fres = pow(1.0 - ndv, 2.0);
	vec3 col = mix(base_color.rgb, deep_color.rgb, clamp(fres * 1.4, 0.0, 1.0));
	col = mix(col, base_color.rgb * 1.25, pow(ndv, 6.0) * 0.35);
	vec3 fp = v_car * flake_scale;
	vec3 cell = floor(fp);
	vec3 rnd = hash33(cell);
	float fw = length(fwidth(fp));
	float flake_vis = flake_amount * (1.0 - smoothstep(0.35, 1.2, fw));
	vec3 fn = normalize(n_view + (VIEW_MATRIX * vec4(rnd * 0.55, 0.0)).xyz * flake_vis);
	float glint = pow(clamp(dot(reflect(-VIEW, fn), vec3(0.0, 0.0, 1.0)) * 0.5 + 0.5, 0.0, 1.0), 40.0) * flake_vis;
	float sparkle = step(0.86, hash13(cell + 7.0)) * flake_vis;
	col += flake_color.rgb * (0.04 * flake_vis + glint * 0.15 * sparkle);
	float mottle = vnoise(v_car * 3.0) * 0.04;
	col *= 1.0 - mottle;
	float fr = clamp(frost, 0.0, 1.0);
	float frost_n = vnoise(v_car * 40.0) * 0.5 + vnoise(v_car * 9.0) * 0.5;
	float frost_m = smoothstep(0.35, 0.75, frost_n + fr * 0.7 - 0.3) * fr;
	float ice_m = clamp(ice * (0.6 + 0.4 * vnoise(v_car * 14.0)), 0.0, 1.0);
	col = mix(col, vec3(0.82, 0.88, 0.95), max(frost_m, ice_m * 0.85));
	col = mix(col, col * vec3(0.55, 0.5, 0.45), dirt);
	ALBEDO = col;
	METALLIC = mix(metallic_amt, 0.0, max(frost_m, ice_m));
	ROUGHNESS = mix(base_roughness - 0.18 * flake_vis * sparkle, 0.75, max(frost_m, ice_m));
	NORMAL = normalize(mix(n_view, fn, 0.12 * flake_vis));
	CLEARCOAT = mix(1.0, 0.0, max(frost_m, ice_m));
	CLEARCOAT_ROUGHNESS = clearcoat_rough;
	SPECULAR = 0.5;
}
