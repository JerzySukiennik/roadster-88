// Hover vapour ring: a horizontal decal under the lift jets playing the looping top-view vapour flipbook (8x8 cells).
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

uniform sampler2D atlas : source_color, filter_linear_mipmap, repeat_disable;
uniform float frame = 0.0;
uniform float alpha = 0.0;
uniform float bright = 1.0;

void fragment() {
	float f = floor(frame);
	vec2 cell = vec2(mod(f, 8.0), floor(f / 8.0));
	vec4 t = texture(atlas, (UV + cell) / 8.0);
	ALBEDO = t.rgb * bright;
	ALPHA = clamp(t.a * alpha, 0.0, 1.0);
}
