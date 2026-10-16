// Generic car surface: PBR with optional albedo / normal / roughness / metallic maps, emission, carbon weave and clearcoat, following the damage field.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

#include "res://src/car/lattice_skin.gdshaderinc"

uniform vec4 albedo : source_color = vec4(0.5, 0.5, 0.5, 1.0);
uniform float roughness : hint_range(0.0, 1.0) = 0.5;
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float clearcoat : hint_range(0.0, 1.0) = 0.0;
uniform float clearcoat_rough : hint_range(0.0, 1.0) = 0.1;
uniform vec4 emission : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float emission_energy = 0.0;
uniform float weave = 0.0;
uniform float grain = 0.0;
uniform sampler2D tex : source_color, hint_default_white, filter_linear_mipmap_anisotropic;
uniform float use_tex = 0.0;
uniform float tex_emit = 0.0;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic;
uniform float use_normal = 0.0;
uniform float normal_scale = 1.0;
uniform sampler2D rough_tex : hint_default_white, filter_linear_mipmap_anisotropic;
uniform vec4 rough_channel = vec4(0.0, 1.0, 0.0, 0.0);
uniform float use_rough = 0.0;
uniform sampler2D metal_tex : hint_default_white, filter_linear_mipmap_anisotropic;
uniform vec4 metal_channel = vec4(0.0, 0.0, 1.0, 0.0);
uniform float use_metal = 0.0;
uniform vec3 uv_scale = vec3(1.0, 1.0, 1.0);
uniform vec3 uv_offset = vec3(0.0, 0.0, 0.0);

varying vec3 v_car;

float h13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

void vertex() {
	v_car = lattice_deform(VERTEX, NORMAL, MODEL_MATRIX);
	UV = UV * uv_scale.xy + uv_offset.xy;
}

void fragment() {
	vec3 col = albedo.rgb;
	float r = roughness;
	float m = metallic;
	vec3 tcol = vec3(1.0);
	if (use_tex > 0.5) {
		tcol = texture(tex, UV).rgb;
		col *= mix(tcol, vec3(1.0), tex_emit);
	}
	if (use_rough > 0.5) {
		r *= dot(texture(rough_tex, UV), rough_channel);
	}
	if (use_metal > 0.5) {
		m *= dot(texture(metal_tex, UV), metal_channel);
	}
	if (use_normal > 0.5) {
		NORMAL_MAP = texture(normal_tex, UV).rgb;
		NORMAL_MAP_DEPTH = normal_scale;
	}
	if (weave > 0.0) {
		vec2 uv = (abs(v_car.x) > 0.5 ? v_car.zy : v_car.xz) * 160.0;
		vec2 c = floor(uv);
		float chk = mod(c.x + c.y, 2.0);
		vec2 f = fract(uv);
		float band = chk > 0.5 ? sin(f.x * 3.14159) : sin(f.y * 3.14159);
		col *= mix(1.0, 0.65 + 0.5 * band, weave);
		r = mix(r, r * (0.7 + 0.5 * chk), weave);
	}
	if (grain > 0.0) {
		float g = h13(floor(v_car * vec3(900.0, 900.0, 40.0)));
		col *= 1.0 - grain * g * 0.25;
		r = clamp(r + (g - 0.5) * grain * 0.15, 0.02, 1.0);
	}
	ALBEDO = col;
	ROUGHNESS = r;
	METALLIC = m;
	if (clearcoat > 0.0) {
		CLEARCOAT = clearcoat;
		CLEARCOAT_ROUGHNESS = clearcoat_rough;
	}
	EMISSION = emission.rgb * emission_energy + (use_tex > 0.5 ? tcol * tex_emit : vec3(0.0));
}
