# MotionBlur: subtle speed-scaled per-pixel motion blur as a CompositorEffect (compute shader reading Godot's motion-vector buffer after transparents).
@tool
class_name MotionBlur
extends CompositorEffect

const GLSL := """
#version 450
layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;
layout(rgba16f, set = 0, binding = 0) uniform restrict writeonly image2D out_color;
layout(set = 0, binding = 1) uniform sampler2D src_color;
layout(set = 0, binding = 2) uniform sampler2D velocity;
layout(set = 0, binding = 3) uniform sampler2D depth_tex;
layout(push_constant, std430) uniform Params {
	vec2 size;
	float intensity;
	float max_px;
} p;
float hash(vec2 v) {
	return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
	ivec2 px = ivec2(gl_GlobalInvocationID.xy);
	if (px.x >= int(p.size.x) || px.y >= int(p.size.y)) {
		return;
	}
	vec2 uv = (vec2(px) + 0.5) / p.size;
	vec4 base0 = texture(src_color, uv);
	if (texture(depth_tex, uv).r <= 0.000001) {
		imageStore(out_color, px, base0);
		return;
	}
	vec2 vel = texture(velocity, uv).xy * p.intensity;
	vec2 vpx = vel * p.size;
	float len = length(vpx);
	vec4 base = texture(src_color, uv);
	if (len < 0.75) {
		imageStore(out_color, px, base);
		return;
	}
	if (len > p.max_px) {
		vel *= p.max_px / len;
		len = p.max_px;
	}
	int n = int(clamp(len * 0.5, 3.0, 12.0));
	float j = hash(vec2(px)) - 0.5;
	vec4 acc = base;
	float wsum = 1.0;
	for (int i = 0; i < n; i++) {
		float t = (float(i) + 0.5 + j) / float(n) - 0.5;
		vec2 suv = uv - vel * t;
		vec4 c = texture(src_color, suv);
		vec2 sv = texture(velocity, suv).xy * p.intensity;
		float w = clamp(length(sv * p.size) / max(len, 1.0), 0.0, 1.0);
		w *= step(0.000001, texture(depth_tex, suv).r);
		acc += c * w;
		wsum += w;
	}
	imageStore(out_color, px, acc / wsum);
}
"""

const COPY_GLSL := """
#version 450
layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;
layout(rgba16f, set = 0, binding = 0) uniform restrict readonly image2D src_img;
layout(rgba16f, set = 0, binding = 1) uniform restrict writeonly image2D dst_img;
layout(push_constant, std430) uniform Params {
	vec2 size;
	float pad0;
	float pad1;
} p;
void main() {
	ivec2 px = ivec2(gl_GlobalInvocationID.xy);
	if (px.x >= int(p.size.x) || px.y >= int(p.size.y)) {
		return;
	}
	imageStore(dst_img, px, imageLoad(src_img, px));
}
"""

var rd: RenderingDevice
var shader: RID
var pipeline: RID
var copy_shader: RID
var copy_pipeline: RID
var sampler: RID
var intensity := 0.0
var max_px := 40.0

func _init() -> void:
	effect_callback_type = CompositorEffect.EFFECT_CALLBACK_TYPE_POST_TRANSPARENT
	needs_motion_vectors = true
	rd = RenderingServer.get_rendering_device()
	RenderingServer.call_on_render_thread(_init_compute)

func _notification(what: int) -> void:
	if what == NOTIFICATION_PREDELETE and rd:
		if shader.is_valid():
			rd.free_rid(shader)
		if copy_shader.is_valid():
			rd.free_rid(copy_shader)
		if sampler.is_valid():
			rd.free_rid(sampler)

func _init_compute() -> void:
	if rd == null:
		return
	var src := RDShaderSource.new()
	src.language = RenderingDevice.SHADER_LANGUAGE_GLSL
	src.source_compute = GLSL
	var spirv := rd.shader_compile_spirv_from_source(src)
	if spirv.compile_error_compute != "":
		push_error("motion blur shader: " + spirv.compile_error_compute)
		return
	shader = rd.shader_create_from_spirv(spirv)
	if not shader.is_valid():
		return
	pipeline = rd.compute_pipeline_create(shader)
	var src2 := RDShaderSource.new()
	src2.language = RenderingDevice.SHADER_LANGUAGE_GLSL
	src2.source_compute = COPY_GLSL
	var spirv2 := rd.shader_compile_spirv_from_source(src2)
	if spirv2.compile_error_compute != "":
		push_error("motion blur copy shader: " + spirv2.compile_error_compute)
		return
	copy_shader = rd.shader_create_from_spirv(spirv2)
	copy_pipeline = rd.compute_pipeline_create(copy_shader)
	var ss := RDSamplerState.new()
	ss.min_filter = RenderingDevice.SAMPLER_FILTER_LINEAR
	ss.mag_filter = RenderingDevice.SAMPLER_FILTER_LINEAR
	ss.repeat_u = RenderingDevice.SAMPLER_REPEAT_MODE_CLAMP_TO_EDGE
	ss.repeat_v = RenderingDevice.SAMPLER_REPEAT_MODE_CLAMP_TO_EDGE
	sampler = rd.sampler_create(ss)

func _render_callback(_type: int, render_data: RenderData) -> void:
	if rd == null or not pipeline.is_valid() or not copy_pipeline.is_valid() or intensity <= 0.001:
		return
	var buffers := render_data.get_render_scene_buffers() as RenderSceneBuffersRD
	if buffers == null:
		return
	var size := buffers.get_internal_size()
	if size.x == 0 or size.y == 0:
		return
	if buffers.has_texture(&"r88_mb", &"src"):
		var fmt: RDTextureFormat = buffers.get_texture_format(&"r88_mb", &"src")
		if fmt.width != size.x or fmt.height != size.y:
			buffers.clear_context(&"r88_mb")
	if not buffers.has_texture(&"r88_mb", &"src"):
		var usage := RenderingDevice.TEXTURE_USAGE_SAMPLING_BIT | RenderingDevice.TEXTURE_USAGE_STORAGE_BIT
		buffers.create_texture(&"r88_mb", &"src", RenderingDevice.DATA_FORMAT_R16G16B16A16_SFLOAT, usage, RenderingDevice.TEXTURE_SAMPLES_1, size, 1, 1, true, false)
	var groups := Vector3i((size.x - 1) / 8 + 1, (size.y - 1) / 8 + 1, 1)
	var pc := PackedFloat32Array([float(size.x), float(size.y), intensity, max_px])
	var pcb := pc.to_byte_array()
	for view in buffers.get_view_count():
		var color := buffers.get_color_layer(view)
		var vel := buffers.get_velocity_layer(view)
		if not vel.is_valid():
			return
		var tmp := buffers.get_texture_slice(&"r88_mb", &"src", view, 0, 1, 1)
		var c0 := RDUniform.new()
		c0.uniform_type = RenderingDevice.UNIFORM_TYPE_IMAGE
		c0.binding = 0
		c0.add_id(color)
		var c1 := RDUniform.new()
		c1.uniform_type = RenderingDevice.UNIFORM_TYPE_IMAGE
		c1.binding = 1
		c1.add_id(tmp)
		var cset := UniformSetCacheRD.get_cache(copy_shader, 0, [c0, c1])
		var cl0 := rd.compute_list_begin()
		rd.compute_list_bind_compute_pipeline(cl0, copy_pipeline)
		rd.compute_list_bind_uniform_set(cl0, cset, 0)
		rd.compute_list_set_push_constant(cl0, pcb, pcb.size())
		rd.compute_list_dispatch(cl0, groups.x, groups.y, groups.z)
		rd.compute_list_end()
		var u0 := RDUniform.new()
		u0.uniform_type = RenderingDevice.UNIFORM_TYPE_IMAGE
		u0.binding = 0
		u0.add_id(color)
		var u1 := RDUniform.new()
		u1.uniform_type = RenderingDevice.UNIFORM_TYPE_SAMPLER_WITH_TEXTURE
		u1.binding = 1
		u1.add_id(sampler)
		u1.add_id(tmp)
		var u2 := RDUniform.new()
		u2.uniform_type = RenderingDevice.UNIFORM_TYPE_SAMPLER_WITH_TEXTURE
		u2.binding = 2
		u2.add_id(sampler)
		u2.add_id(vel)
		var u3 := RDUniform.new()
		u3.uniform_type = RenderingDevice.UNIFORM_TYPE_SAMPLER_WITH_TEXTURE
		u3.binding = 3
		u3.add_id(sampler)
		u3.add_id(buffers.get_depth_layer(view))
		var uset := UniformSetCacheRD.get_cache(shader, 0, [u0, u1, u2, u3])
		var cl := rd.compute_list_begin()
		rd.compute_list_bind_compute_pipeline(cl, pipeline)
		rd.compute_list_bind_uniform_set(cl, uset, 0)
		rd.compute_list_set_push_constant(cl, pcb, pcb.size())
		rd.compute_list_dispatch(cl, groups.x, groups.y, groups.z)
		rd.compute_list_end()
