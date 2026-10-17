// Thruster plume: short white condensation jet with turbulent noise, brightest at the nozzle exit, plus a faint refraction shimmer.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

uniform float strength : hint_range(0.0, 1.5) = 0.0;
uniform float seed = 0.0;
uniform float shimmer = 0.012;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;

varying vec3 lpos;

float h13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float vn(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void vertex() {
	lpos = VERTEX;
}

void fragment() {
	float along = clamp(-lpos.y + 0.5, 0.0, 1.0);
	float rim = abs(dot(normalize(NORMAL), VIEW));
	float n = vn(vec3(lpos.x * 6.0, lpos.y * 5.0 - TIME * 14.0, lpos.z * 6.0) + seed) * 0.65 + vn(vec3(lpos.xz * 14.0, lpos.y * 12.0 - TIME * 30.0) + seed * 3.0) * 0.35;
	float core = pow(rim, 1.6);
	float fade = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.06, along);
	float dens = core * fade * (0.45 + 0.75 * n) * strength;
	float depth = texture(depth_tex, SCREEN_UV).r;
	vec4 ndc = vec4(SCREEN_UV * 2.0 - 1.0, depth, 1.0);
	vec4 vpos = INV_PROJECTION_MATRIX * ndc;
	vpos.xyz /= vpos.w;
	float soft = clamp((VERTEX.z - vpos.z) * 4.0, 0.0, 1.0);
	vec2 off = (vec2(n, vn(lpos * 9.0 + TIME * 7.0)) - 0.5) * shimmer * strength * fade;
	vec3 behind = textureLod(screen_tex, SCREEN_UV + off, 0.0).rgb;
	vec3 white = vec3(0.92, 0.95, 1.0);
	float a = clamp(dens * 0.9, 0.0, 0.9);
	ALBEDO = mix(behind, white * 1.1, a);
	ALPHA = clamp(clamp(strength * 2.5, 0.0, 1.0) * fade * max(core, 0.25) * soft, 0.0, 1.0);
}
