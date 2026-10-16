// Distant hills: dry grass and rock by slope and height, aerial perspective handled by fog.
shader_type spatial;
render_mode cull_back, diffuse_burley;

varying vec3 wpos;
varying vec3 wn;

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

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
	float n = n2(wpos.xz * 0.01) * 0.6 + n2(wpos.xz * 0.05) * 0.4;
	vec3 grass = mix(vec3(0.62, 0.5, 0.33), vec3(0.5, 0.42, 0.28), n);
	vec3 scrub = vec3(0.26, 0.27, 0.18);
	vec3 rock = mix(vec3(0.42, 0.38, 0.34), vec3(0.3, 0.28, 0.26), n);
	vec3 col = mix(grass, scrub, smoothstep(0.55, 0.8, n) * 0.6);
	col = mix(col, rock, smoothstep(0.35, 0.6, slope));
	ALBEDO = col;
	ROUGHNESS = 0.95;
}
