// Sky: analytic Rayleigh/Mie atmosphere (after Godot's PhysicalSkyMaterial), sun disk, static cirrus/cumulus layer, stars and moon at night.
shader_type sky;
render_mode use_quarter_res_pass;

uniform float rayleigh = 2.0;
uniform vec4 rayleigh_color : source_color = vec4(0.26, 0.41, 0.58, 1.0);
uniform float mie = 0.005;
uniform float mie_eccentricity = 0.78;
uniform vec4 mie_color : source_color = vec4(0.69, 0.729, 0.812, 1.0);
uniform float turbidity = 6.0;
uniform float sun_disk_scale = 1.2;
uniform vec4 ground_color : source_color = vec4(0.36, 0.33, 0.29, 1.0);
uniform float exposure = 0.2;
uniform float cloud_cover = 0.4;
uniform vec2 cloud_offset = vec2(0.0, 0.0);
uniform float star_strength = 1.0;
uniform vec3 moon_dir = vec3(0.3, 0.5, -0.8);
uniform float night_floor = 0.0;

const vec3 UP = vec3(0.0, 1.0, 0.0);
const float RAY_Z = 8.4e3;
const float MIE_Z = 1.25e3;

float hg(float c, float g) {
	return 0.0795774715459 * (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}

float h12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float h13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float n2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
	float a = 0.5;
	float s = 0.0;
	for (int i = 0; i < 6; i++) {
		s += a * n2(p);
		p = mat2(vec2(1.6, 1.2), vec2(-1.2, 1.6)) * p;
		a *= 0.5;
	}
	return s;
}

vec3 atmosphere(vec3 dir, vec3 sdir, float sun_e, out vec3 ext) {
	float zen_cos = clamp(dot(UP, sdir), -1.0, 1.0);
	float sun_energy = max(0.0, 1.0 - exp(-((PI * 0.5) - acos(zen_cos)))) * 1000.0 * clamp(sun_e, 0.0, 1.0);
	float sun_fade = 1.0 - clamp(1.0 - exp(sdir.y), 0.0, 1.0);
	float rc = rayleigh - (1.0 - sun_fade);
	vec3 rb = rc * rayleigh_color.rgb * 0.0001;
	vec3 mb = turbidity * mie * mie_color.rgb * 0.000434;
	float zenith = acos(max(0.0, dot(UP, dir)));
	float om = 1.0 / (cos(zenith) + 0.15 * pow(93.885 - degrees(zenith), -1.253));
	ext = exp(-(rb * RAY_Z * om + mb * MIE_Z * om));
	float ct = dot(dir, sdir);
	float rp = (3.0 / (16.0 * PI)) * (1.0 + pow(ct * 0.5 + 0.5, 2.0));
	vec3 brt = rb * rp;
	vec3 bmt = mb * hg(ct, mie_eccentricity);
	vec3 lin = pow(sun_energy * ((brt + bmt) / (rb + mb)) * (1.0 - ext), vec3(1.5));
	lin *= mix(vec3(1.0), pow(sun_energy * ((brt + bmt) / (rb + mb)) * ext, vec3(0.5)), clamp(pow(1.0 - zen_cos, 5.0), 0.0, 1.0));
	return lin;
}

vec3 sky_base(vec3 dir, vec3 sdir, float se, float ct) {
	vec3 ext;
	vec3 lin = atmosphere(dir, sdir, max(se / 2.4, 0.0), ext);
	float horizon_k = smoothstep(-0.12, 0.04, dir.y);
	lin *= mix(ground_color.rgb, vec3(1.0), horizon_k);
	float day = smoothstep(-0.18, 0.08, sdir.y);
	vec3 col = lin * 0.04;
	float sun_fade = 1.0 - clamp(1.0 - exp(sdir.y), 0.0, 1.0);
	col = pow(max(col, vec3(0.0)), vec3(1.0 / (1.2 + 1.2 * sun_fade)));
	col *= exposure;
	vec3 night = vec3(0.004, 0.007, 0.016) * (0.4 + 0.6 * pow(max(dir.y, 0.0), 0.3)) + night_floor;
	vec3 md = normalize(moon_dir);
	float moon_glow = pow(max(dot(dir, md), 0.0), 220.0) * 0.06;
	night += vec3(0.25, 0.3, 0.4) * moon_glow;
	col = mix(night, col + night * 0.15, day);
	if (dir.y > 0.0) {
		vec2 cp = dir.xz / (dir.y + 0.08) * 1.6 + cloud_offset;
		float c1 = fbm(cp * 0.9);
		float c2 = fbm(cp * 3.1 + vec2(4.0, 1.0));
		float dens = smoothstep(1.0 - cloud_cover, 1.05 - cloud_cover * 0.5, c1 * 0.75 + c2 * 0.35);
		dens *= smoothstep(0.0, 0.18, dir.y);
		float cirrus = smoothstep(0.55, 0.9, fbm(vec2(cp.x * 0.35, cp.y * 2.6) + 9.0)) * 0.35 * smoothstep(0.02, 0.3, dir.y);
		float lit = clamp(0.55 + 0.45 * ct, 0.0, 1.0);
		vec3 sun_tint = mix(vec3(1.0, 0.55, 0.3), vec3(1.0), smoothstep(0.0, 0.35, sdir.y));
		float sky_l = max(max(col.r, col.g), col.b);
		vec3 cloud_day = mix(vec3(0.78, 0.8, 0.86), vec3(1.0, 0.99, 0.97) * sun_tint, lit) * max(sky_l * 1.25, 0.35 * day) * day;
		cloud_day += sun_tint * pow(max(ct, 0.0), 12.0) * 0.5 * day * sky_l;
		vec3 cloud_night = vec3(0.012, 0.015, 0.024) + vec3(0.04, 0.045, 0.055) * moon_glow * 10.0;
		vec3 cloud_col = mix(cloud_night, cloud_day, day);
		float a = clamp(dens * 0.75 + cirrus * 0.6, 0.0, 1.0);
		col = mix(col, cloud_col * (0.82 + 0.18 * c2), a);
		col = max(col, vec3(0.0));
		return vec3(col);
	}
	return col;
}

vec3 sky_sharp(vec3 dir, vec3 sdir, float se, float ct) {
	vec3 ext;
	vec3 dummy = atmosphere(dir, sdir, 0.0, ext);
	float sd_cos = cos(LIGHT0_SIZE * sun_disk_scale);
	float sd_cos2 = cos(LIGHT0_SIZE * sun_disk_scale * 0.5);
	float disk = smoothstep(sd_cos, sd_cos2, ct);
	float sun_fade = 1.0 - clamp(1.0 - exp(sdir.y), 0.0, 1.0);
	vec3 sun_l = (clamp(se / 2.4, 0.0, 1.0) * 1000.0 * 1900.0 * ext) * disk * LIGHT0_COLOR * 0.04;
	sun_l = pow(max(sun_l, vec3(0.0)), vec3(1.0 / (1.2 + 1.2 * sun_fade))) * exposure * disk;
	float day = smoothstep(-0.18, 0.08, sdir.y);
	vec3 sp = floor(dir * 420.0);
	float st = h13(sp);
	float star = step(0.9975, st) * pow(h13(sp + 3.7), 3.0) * 5.0 * smoothstep(0.0, 0.15, dir.y);
	float tw = 0.7 + 0.3 * h13(sp + 9.1);
	vec3 md = normalize(moon_dir);
	float moon = smoothstep(0.99955, 0.9997, dot(dir, md));
	vec3 night = vec3(0.85, 0.9, 1.0) * star * tw * star_strength + vec3(0.85, 0.88, 0.95) * moon * 1.6;
	return sun_l + night * (1.0 - day);
}

void sky() {
	vec3 dir = EYEDIR;
	vec3 sdir = LIGHT0_ENABLED ? normalize(LIGHT0_DIRECTION) : vec3(0.0, -1.0, 0.0);
	float se = LIGHT0_ENABLED ? LIGHT0_ENERGY : 0.0;
	float ct = dot(dir, sdir);
	if (AT_CUBEMAP_PASS) {
		COLOR = sky_base(dir, sdir, se, ct) + sky_sharp(dir, sdir, se, ct) * 0.02;
	} else if (AT_QUARTER_RES_PASS) {
		COLOR = sky_base(dir, sdir, se, ct);
	} else {
		COLOR = QUARTER_RES_COLOR.rgb + sky_sharp(dir, sdir, se, ct);
	}
}
