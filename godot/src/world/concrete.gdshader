// Proving-ground concrete: world-space slabs, joints, subtle 1 m grid, wear, tyre marks, colour-coded zone paint.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec4 base_color : source_color = vec4(0.47, 0.468, 0.46, 1.0);
uniform float slab = 6.0;
uniform float grid_strength = 0.1;
uniform float wetness = 0.0;
uniform float tile_scale = 1.0;
uniform sampler2D zone_tex : source_color, filter_linear, repeat_disable, hint_default_black;
uniform vec4 zone_rect = vec4(-1200.0, -600.0, 2400.0, 3000.0);
uniform float far_fade = 900.0;
uniform sampler2D noise_tex : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;

varying vec3 wpos;

float h12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float n2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
	return texture(noise_tex, p * 0.125).r;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = wpos.xz * tile_scale;
	float dist = length(wpos - CAMERA_POSITION_WORLD);
	vec2 sc = floor(p / slab);
	float slab_tone = (h12(sc) - 0.5) * 0.07;
	vec2 sf = fract(p / slab) * slab;
	float jw = fwidth(p.x) * 1.2 + 0.012;
	float joint = 1.0 - smoothstep(0.0, jw, min(min(sf.x, slab - sf.x), min(sf.y, slab - sf.y)));
	vec2 gf = abs(fract(p) - 0.5);
	float gw = fwidth(p.x) * 1.0 + 0.004;
	float grid = (1.0 - smoothstep(0.5 - gw, 0.5, max(gf.x, gf.y)));
	grid = 1.0 - smoothstep(0.0, gw * 1.5, 0.5 - max(gf.x, gf.y));
	float lod = clamp(dist / 120.0, 0.0, 1.0);
	float big = fbm(p * 0.03);
	float mid = fbm(p * 0.35);
	float fine = texture(noise_tex, p * 0.43).g * (1.0 - lod);
	float speck = step(0.93, h12(floor(p * 60.0))) * (1.0 - lod) * 0.5;
	vec3 col = base_color.rgb * (1.0 + slab_tone * 0.7 + (big - 0.5) * 0.1 + (mid - 0.5) * 0.05 + (fine - 0.5) * 0.04 - speck * 0.06);
	vec2 zuv = (wpos.xz - zone_rect.xy) / zone_rect.zw;
	vec4 zone = texture(zone_tex, zuv);
	float paint_wear = smoothstep(0.25, 0.7, fbm(p * 0.8 + 4.0));
	col = mix(col, zone.rgb, zone.a * (0.75 + 0.25 * paint_wear));
	col *= 1.0 - joint * 0.38;
	col *= 1.0 - grid * grid_strength * (1.0 - lod * 0.7);
	float stain = smoothstep(0.55, 0.85, fbm(p * 0.12 + 20.0));
	col *= 1.0 - stain * 0.07;
	float lane = 1.0 - smoothstep(9.5, 12.0, abs(wpos.x));
	float tyre = smoothstep(0.62, 0.9, texture(noise_tex, vec2(wpos.x * 0.9, wpos.z * 0.008)).r) * lane;
	float rub = smoothstep(0.5, 1.0, texture(noise_tex, vec2(wpos.x * 2.3 + 0.37, wpos.z * 0.02)).r) * lane;
	col *= 1.0 - tyre * 0.16 - rub * 0.06;
	float rough = 0.82 - zone.a * 0.18 - wetness * 0.5 + (mid - 0.5) * 0.1;
	rough = mix(rough, 0.95, joint * 0.5);
	ALBEDO = col;
	ROUGHNESS = clamp(rough, 0.05, 1.0);
	METALLIC = 0.0;
	SPECULAR = 0.45;
	float nn = (texture(noise_tex, p * 0.9).g - 0.5) * (1.0 - lod);
	NORMAL_MAP = normalize(vec3(nn * 0.25 + joint * 0.0, nn * 0.25, 1.0)) * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 0.6;
}
