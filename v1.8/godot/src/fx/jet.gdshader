// Cold-gas jet: a billboard along the nozzle exhaust axis that turns about the axis to face the camera, textured with the Cycles vapour flipbook (8x8 cells), with soft depth fade.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled, world_vertex_coords;

uniform sampler2D atlas : source_color, filter_linear_mipmap, repeat_disable;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;
uniform vec3 axis_local = vec3(0.0, 0.0, -1.0);
uniform float len = 2.0;
uniform float wid = 1.0;
uniform float frame = 0.0;
uniform float alpha = 0.0;
uniform float bright = 1.0;

void vertex() {
	vec3 o = MODEL_MATRIX[3].xyz;
	vec3 ax = normalize((MODEL_MATRIX * vec4(axis_local, 0.0)).xyz);
	vec3 cam = INV_VIEW_MATRIX[3].xyz;
	vec3 ctr = o + ax * len * 0.488;
	vec3 side = cross(ax, cam - ctr);
	side = length(side) < 1e-5 ? normalize(cross(ax, vec3(0.0, 1.0, 0.0))) : normalize(side);
	VERTEX = o + ax * ((UV.x - 0.012) * len) + side * ((0.5 - UV.y) * wid);
}

void fragment() {
	float f = floor(frame);
	vec2 cell = vec2(mod(f, 8.0), floor(f / 8.0));
	vec4 t = texture(atlas, (UV + cell) / 8.0);
	float depth = texture(depth_tex, SCREEN_UV).r;
	vec4 ndc = vec4(SCREEN_UV * 2.0 - 1.0, depth, 1.0);
	vec4 vp = INV_PROJECTION_MATRIX * ndc;
	vp.xyz /= vp.w;
	float soft = clamp((VERTEX.z - vp.z) / 0.3, 0.0, 1.0);
	ALBEDO = t.rgb * bright;
	ALPHA = clamp(t.a * alpha * soft, 0.0, 1.0);
}
