// Structure material: triplanar cast concrete / painted steel with form-tie marks, edge wear and optional hazard stripes.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec4 base_color : source_color = vec4(0.62, 0.61, 0.59, 1.0);
uniform float roughness : hint_range(0.0, 1.0) = 0.85;
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float panel = 1.5;
uniform float stripes = 0.0;
uniform vec4 stripe_color : source_color = vec4(0.95, 0.72, 0.05, 1.0);
uniform float corrugate = 0.0;
uniform sampler2D noise_tex : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;

varying vec3 wpos;
varying vec3 wnrm;

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

float tri(vec3 p, vec3 n, float sc) {
	vec3 w = pow(abs(n), vec3(4.0));
	w /= (w.x + w.y + w.z);
	return fbm(p.yz * sc) * w.x + fbm(p.xz * sc) * w.y + fbm(p.xy * sc) * w.z;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 n = normalize(wnrm);
	float big = tri(wpos, n, 0.25);
	float fine = tri(wpos, n, 3.0);
	vec3 col = base_color.rgb * (0.9 + (big - 0.5) * 0.25 + (fine - 0.5) * 0.12);
	vec2 pp = abs(n.y) > 0.7 ? wpos.xz : (abs(n.x) > abs(n.z) ? wpos.zy : wpos.xy);
	vec2 pf = fract(pp / panel);
	float seam = 1.0 - smoothstep(0.0, 0.012, min(min(pf.x, 1.0 - pf.x), min(pf.y, 1.0 - pf.y)));
	col *= 1.0 - seam * 0.18 * (1.0 - corrugate);
	vec2 tie = abs(fract(pp / panel * 2.0) - 0.5);
	float ties = (1.0 - smoothstep(0.015, 0.03, length(tie))) * step(abs(n.y), 0.7) * (1.0 - corrugate);
	col *= 1.0 - ties * 0.35;
	if (stripes > 0.0) {
		float s = step(0.5, fract((pp.x + pp.y) * 1.2));
		float band = step(wpos.y, 0.9) * step(abs(n.y), 0.7);
		col = mix(col, mix(stripe_color.rgb, vec3(0.03), s), band * stripes);
	}
	float r = roughness;
	if (corrugate > 0.0) {
		float cg = sin(pp.x * 3.14159 / 0.15);
		NORMAL_MAP = normalize(vec3(cg * 0.35 * corrugate, 0.0, 1.0)) * 0.5 + 0.5;
		r = roughness - 0.1 * big;
	}
	float grime = smoothstep(0.4, 0.0, wpos.y - floor(wpos.y / 400.0)) * 0.0;
	ALBEDO = col * (1.0 - grime);
	ROUGHNESS = clamp(r + (fine - 0.5) * 0.15, 0.05, 1.0);
	METALLIC = metallic;
}
