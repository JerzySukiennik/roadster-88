# PostFx: speed-scaled motion blur (CompositorEffect on the camera) and a physically-occluded sun lens flare overlay.
extends CanvasLayer

const MPH := 0.44704
const FLARE := """
shader_type canvas_item;
render_mode blend_add, unshaded;
uniform vec2 sun_uv = vec2(0.5, 0.5);
uniform float vis = 0.0;
uniform float aspect = 1.6;
float disc(vec2 uv, vec2 c, float r, float soft) {
	vec2 d = uv - c;
	d.x *= aspect;
	return 1.0 - smoothstep(r * (1.0 - soft), r, length(d));
}
float hexa(vec2 uv, vec2 c, float r) {
	vec2 d = uv - c;
	d.x *= aspect;
	d = abs(d);
	float h = max(d.x * 0.866 + d.y * 0.5, d.y);
	return 1.0 - smoothstep(r * 0.85, r, h);
}
void fragment() {
	vec2 uv = UV;
	vec2 c = vec2(0.5);
	vec2 axis = c - sun_uv;
	vec3 col = vec3(0.0);
	vec2 d = uv - sun_uv;
	d.x *= aspect;
	float r = length(d);
	col += vec3(1.0, 0.92, 0.8) * exp(-r * 9.0) * 0.35;
	col += vec3(1.0, 0.95, 0.85) * exp(-r * 40.0) * 0.6;
	float streak = exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.5);
	col += vec3(0.8, 0.88, 1.0) * streak * 0.18;
	col += vec3(0.35, 0.55, 1.0) * hexa(uv, sun_uv + axis * 0.55, 0.035) * 0.07;
	col += vec3(0.8, 0.5, 0.3) * hexa(uv, sun_uv + axis * 0.9, 0.06) * 0.05;
	col += vec3(0.4, 0.9, 0.6) * disc(uv, sun_uv + axis * 1.25, 0.02, 0.6) * 0.08;
	col += vec3(0.6, 0.6, 1.0) * disc(uv, sun_uv + axis * 1.6, 0.09, 0.9) * 0.04;
	col += vec3(1.0, 0.7, 0.4) * disc(uv, sun_uv + axis * 2.1, 0.03, 0.5) * 0.05;
	COLOR = vec4(col * vis, 1.0);
}
"""

var game
var blur: MotionBlur
var flare: ColorRect
var flare_mat: ShaderMaterial
var vis := 0.0
var enabled_blur := true

func setup(g) -> void:
	game = g
	name = "PostFx"
	layer = 2
	blur = MotionBlur.new()
	var comp := Compositor.new()
	comp.compositor_effects = [blur]
	game.cam.compositor = comp
	flare = ColorRect.new()
	flare.set_anchors_preset(Control.PRESET_FULL_RECT)
	flare.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flare_mat = ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = FLARE
	flare_mat.shader = sh
	flare.material = flare_mat
	add_child(flare)

func on_preset(p: int) -> void:
	enabled_blur = p >= 1

func _process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	var c: Car = game.car
	var cam: Camera3D = game.cam
	if c == null or cam == null:
		Prof.add("post", Time.get_ticks_usec() - __t0)
		return
	var mph := c.linear_velocity.length() / MPH
	var k := clampf((mph - 35.0) / 165.0, 0.0, 1.0)
	blur.intensity = (0.15 + 0.55 * k) * k if enabled_blur else 0.0
	blur.max_px = 26.0 + 30.0 * k
	var sun_dir: Vector3 = game.sky.sun_dir
	var want := 0.0
	var vs := get_viewport().get_visible_rect().size
	if sun_dir.y > -0.02 and game.sky.sun.visible:
		var far := cam.global_position + sun_dir * 2000.0
		if not cam.is_position_behind(far):
			var sp := cam.unproject_position(far)
			var uv := sp / vs
			if uv.x > -0.2 and uv.x < 1.2 and uv.y > -0.2 and uv.y < 1.2:
				var q := PhysicsRayQueryParameters3D.create(cam.global_position, cam.global_position + sun_dir * 1500.0, 1 | 2)
				var hit := cam.get_world_3d().direct_space_state.intersect_ray(q)
				var center_k := 1.0 - clampf((uv - Vector2(0.5, 0.5)).length() / 0.9, 0.0, 1.0)
				want = (0.0 if not hit.is_empty() else 1.0) * (0.35 + 0.65 * center_k) * clampf(sun_dir.y * 6.0 + 0.4, 0.0, 1.0)
				flare_mat.set_shader_parameter("sun_uv", uv)
	vis = move_toward(vis, want, dt * 4.0)
	flare.visible = vis > 0.003
	flare_mat.set_shader_parameter("vis", vis)
	flare_mat.set_shader_parameter("aspect", vs.x / maxf(vs.y, 1.0))
	Prof.add("post", Time.get_ticks_usec() - __t0)

