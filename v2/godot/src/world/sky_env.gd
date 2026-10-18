# SkyEnv: sun and moon from a date and hour at the proving ground latitude, the physical sky, environment effects and quality presets.
class_name SkyEnv
extends Node3D

const LATITUDE := 35.0
const PRESETS := ["Low", "Medium", "High", "Ultra"]

var env: Environment
var world_env: WorldEnvironment
var sun: DirectionalLight3D
var moon: DirectionalLight3D
var sky_mat: ShaderMaterial
var sun_dir: Vector3 = Vector3(0, 1, 0)
var sun_elev: float = 45.0
var night: float = 0.0
var preset: int = 2
var month: int = 10
var day: int = 15
var hour: float = 14.0

func build() -> void:
	name = "SkyEnv"
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = load("res://src/world/sky.gdshader")
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_256
	sky.process_mode = Sky.PROCESS_MODE_QUALITY
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.ambient_light_sky_contribution = 0.85
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.0
	env.set("tonemap_agx_contrast", 1.12)
	env.glow_enabled = true
	env.glow_intensity = 0.32
	env.glow_strength = 1.0
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.3
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.set("glow_levels/1", 0.0)
	env.set("glow_levels/2", 0.6)
	env.set("glow_levels/3", 1.0)
	env.set("glow_levels/4", 0.6)
	env.set("glow_levels/5", 0.3)
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_density = 0.00012
	env.fog_aerial_perspective = 0.85
	env.fog_sky_affect = 0.0
	env.fog_light_color = Color(0.62, 0.7, 0.82)
	env.fog_sun_scatter = 0.25
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.04
	env.adjustment_saturation = 1.06
	world_env = WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.light_angular_distance = 0.53
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.05
	sun.shadow_normal_bias = 2.2
	sun.light_bake_mode = Light3D.BAKE_DYNAMIC
	add_child(sun)
	moon = DirectionalLight3D.new()
	moon.name = "Moon"
	moon.light_color = Color(0.62, 0.72, 0.95)
	moon.light_energy = 0.0
	moon.shadow_enabled = false
	moon.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY
	add_child(moon)
	set_time(month, day, hour)

static func sun_vector(m: int, d: int, h: float, lat_deg: float) -> Vector3:
	var days := [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
	var n := float(days[clampi(m, 1, 12) - 1] + d)
	var decl := deg_to_rad(-23.44) * cos(TAU / 365.0 * (n + 10.0))
	var lat := deg_to_rad(lat_deg)
	var ha := deg_to_rad(15.0 * (h - 12.0))
	var sin_el := sin(lat) * sin(decl) + cos(lat) * cos(decl) * cos(ha)
	var el := asin(clampf(sin_el, -1.0, 1.0))
	var cos_az := (sin(decl) - sin(el) * sin(lat)) / maxf(cos(el) * cos(lat), 1e-5)
	var az := acos(clampf(cos_az, -1.0, 1.0))
	if ha > 0.0:
		az = TAU - az
	var east := cos(el) * sin(az)
	var north := cos(el) * cos(az)
	return Vector3(-east, sin(el), north).normalized()

func set_time(m: int, d: int, h: float) -> void:
	month = m
	day = d
	hour = h
	sun_dir = sun_vector(m, d, h, LATITUDE)
	sun_elev = rad_to_deg(asin(sun_dir.y))
	var sd := sun_dir
	if sd.y < -0.02:
		sun.visible = false
	else:
		sun.visible = true
	sun.look_at_from_position(Vector3.ZERO, -sd, Vector3.UP if absf(sd.y) < 0.99 else Vector3.FORWARD)
	var e := clampf(sd.y * 4.0 + 0.15, 0.0, 1.0)
	var warm := clampf(1.0 - sd.y * 3.2, 0.0, 1.0)
	sun.light_color = Color(1.0, 0.97, 0.92).lerp(Color(1.0, 0.62, 0.36), warm * 0.85)
	sun.light_energy = 2.7 * e
	night = clampf((-sd.y + 0.04) / 0.16, 0.0, 1.0)
	var md := Vector3(-sd.x, maxf(0.35, -sd.y * 0.8 + 0.25), -sd.z).normalized()
	moon.visible = night > 0.05
	moon.light_energy = 0.13 * night
	moon.look_at_from_position(Vector3.ZERO, -md, Vector3.UP)
	sky_mat.set_shader_parameter("moon_dir", md)
	sky_mat.set_shader_parameter("star_strength", night)
	env.ambient_light_energy = lerpf(1.0, 0.55, night)
	env.background_energy_multiplier = 1.0
	env.tonemap_exposure = lerpf(1.0, 2.3, night)
	env.fog_light_color = Color(0.62, 0.7, 0.82).lerp(Color(0.05, 0.06, 0.09), night)
	env.fog_light_energy = lerpf(1.0, 0.2, night)
	if env.volumetric_fog_enabled:
		env.volumetric_fog_albedo = Color(0.85, 0.86, 0.9).lerp(Color(0.4, 0.45, 0.6), night)

func is_night() -> bool:
	return sun_dir.y < 0.06

func apply_preset(p: int, vp: Viewport) -> void:
	preset = clampi(p, 0, 3)
	var shadow_dist: float = [140.0, 220.0, 320.0, 420.0][preset]
	sun.directional_shadow_max_distance = shadow_dist
	sun.directional_shadow_mode = [DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS, DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS, DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS, DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS][preset]
	sun.directional_shadow_split_1 = 0.06
	sun.directional_shadow_split_2 = 0.18
	sun.directional_shadow_split_3 = 0.45
	sun.shadow_blur = [0.6, 1.0, 1.2, 1.3][preset]
	RenderingServer.directional_shadow_atlas_set_size([2048, 4096, 4096, 8192][preset], true)
	RenderingServer.directional_soft_shadow_filter_set_quality([RenderingServer.SHADOW_QUALITY_SOFT_VERY_LOW, RenderingServer.SHADOW_QUALITY_SOFT_LOW, RenderingServer.SHADOW_QUALITY_SOFT_MEDIUM, RenderingServer.SHADOW_QUALITY_SOFT_HIGH][preset])
	RenderingServer.positional_soft_shadow_filter_set_quality([RenderingServer.SHADOW_QUALITY_SOFT_VERY_LOW, RenderingServer.SHADOW_QUALITY_SOFT_LOW, RenderingServer.SHADOW_QUALITY_SOFT_LOW, RenderingServer.SHADOW_QUALITY_SOFT_MEDIUM][preset])
	env.ssao_enabled = preset >= 1
	env.ssao_radius = 1.2
	env.ssao_intensity = 1.6
	env.ssao_power = 1.4
	env.ssao_detail = 0.6
	env.ssao_light_affect = 0.15
	RenderingServer.environment_set_ssao_quality([RenderingServer.ENV_SSAO_QUALITY_VERY_LOW, RenderingServer.ENV_SSAO_QUALITY_LOW, RenderingServer.ENV_SSAO_QUALITY_MEDIUM, RenderingServer.ENV_SSAO_QUALITY_HIGH][preset], preset < 3, 0.5, 2, 50.0, 300.0)
	env.ssil_enabled = preset >= 3
	env.ssil_radius = 4.0
	env.ssil_intensity = 0.8
	RenderingServer.environment_set_ssil_quality([RenderingServer.ENV_SSIL_QUALITY_VERY_LOW, RenderingServer.ENV_SSIL_QUALITY_LOW, RenderingServer.ENV_SSIL_QUALITY_LOW, RenderingServer.ENV_SSIL_QUALITY_MEDIUM][preset], true, 0.5, 4, 50.0, 300.0)
	env.ssr_enabled = preset >= 2
	env.ssr_max_steps = [16, 32, 48, 72][preset]
	env.ssr_fade_in = 0.12
	env.ssr_fade_out = 2.5
	env.ssr_depth_tolerance = 0.3
	RenderingServer.environment_set_ssr_roughness_quality([RenderingServer.ENV_SSR_ROUGHNESS_QUALITY_DISABLED, RenderingServer.ENV_SSR_ROUGHNESS_QUALITY_LOW, RenderingServer.ENV_SSR_ROUGHNESS_QUALITY_LOW, RenderingServer.ENV_SSR_ROUGHNESS_QUALITY_MEDIUM][preset])
	env.sdfgi_enabled = preset >= 3
	env.sdfgi_use_occlusion = true
	env.sdfgi_cascades = 4
	env.sdfgi_min_cell_size = 0.2
	env.sdfgi_energy = 0.9
	env.volumetric_fog_enabled = preset >= 3
	env.volumetric_fog_density = 0.0016
	env.volumetric_fog_albedo = Color(0.85, 0.86, 0.9)
	env.volumetric_fog_anisotropy = 0.55
	env.volumetric_fog_length = 120.0
	env.volumetric_fog_detail_spread = 2.0
	env.volumetric_fog_gi_inject = 0.5
	env.volumetric_fog_sky_affect = 0.0
	env.volumetric_fog_temporal_reprojection_enabled = true
	env.glow_enabled = true
	env.set("glow_levels/5", 0.3 if preset >= 3 else 0.0)
	env.set("glow_levels/4", 0.6 if preset >= 1 else 0.0)
	RenderingServer.environment_glow_set_use_bicubic_upscale(preset >= 3)
	var sky: Sky = env.sky
	sky.radiance_size = [Sky.RADIANCE_SIZE_64, Sky.RADIANCE_SIZE_128, Sky.RADIANCE_SIZE_256, Sky.RADIANCE_SIZE_256][preset]
	if vp:
		vp.msaa_3d = Viewport.MSAA_DISABLED
		vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if preset == 0 else Viewport.SCREEN_SPACE_AA_DISABLED
		vp.use_taa = preset >= 1
		vp.use_debanding = true
		vp.mesh_lod_threshold = [4.0, 2.0, 1.0, 0.5][preset]
		vp.positional_shadow_atlas_size = [1024, 2048, 4096, 4096][preset]
	set_time(month, day, hour)
