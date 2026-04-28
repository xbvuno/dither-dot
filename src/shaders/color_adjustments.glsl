in vec2 vTextureCoord;

uniform sampler2D uTexture;

/* COLOR CONTROLS */
uniform float uGamma;        // 1.0 = unchanged
uniform float uContrast;     // 1.0 = unchanged
uniform float uSaturation;   // 1.0 = unchanged
uniform float uHue;          // radians
uniform float uBlacks;       // -1 → 1
uniform float uWhites;       // -1 → 1
uniform float uNoiseCoverage;
uniform float uNoiseIntensity;
uniform float uNoiseSaturation;
uniform float uNoisePhase;

out vec4 finalColor;


/* ---------- Helpers ---------- */

vec3 applyLevels(vec3 color, float blacks, float whites)
{
    float b = blacks;
    float w = 1.0 + whites;

    color = (color - b) / (w - b);
    return clamp(color, 0.0, 1.0);
}

vec3 applyContrast(vec3 color, float contrast)
{
    return (color - 0.5) * contrast + 0.5;
}

vec3 applySaturation(vec3 color, float saturation)
{
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luma), color, saturation);
}

/* Hue rotation (IQ method — stable & fast) */
vec3 applyHue(vec3 color, float angle)
{
    float s = sin(angle);
    float c = cos(angle);

    mat3 hueMat = mat3(
        vec3(0.299 + 0.701*c + 0.168*s, 0.587 - 0.587*c + 0.330*s, 0.114 - 0.114*c - 0.497*s),
        vec3(0.299 - 0.299*c - 0.328*s, 0.587 + 0.413*c + 0.035*s, 0.114 - 0.114*c + 0.292*s),
        vec3(0.299 - 0.300*c + 1.250*s, 0.587 - 0.588*c - 1.050*s, 0.114 + 0.886*c - 0.203*s)
    );

    return clamp(hueMat * color, 0.0, 1.0);
}

vec3 applyGamma(vec3 color, float gammaVal)
{
    return pow(color, vec3(1.0 / gammaVal));
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 k = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
    return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);
}

vec3 applyNoise(vec3 color, vec2 uv, float coverage, float intensity, float saturation)
{
    float c = clamp(coverage, 0.0, 1.0);
    float i = clamp(intensity, 0.0, 1.0);
    float s = clamp(saturation, 0.0, 1.0);

    if (c <= 0.0 || i <= 0.0) {
        return color;
    }

    vec2 phaseOffset = vec2(uNoisePhase * 0.1231, uNoisePhase * 0.9173);
    float mask = step(hash21((uv + phaseOffset) * vec2(1733.0, 947.0)), c);
    float hue = hash21((uv + phaseOffset.yx) * vec2(659.0, 1217.0));
    vec3 noiseColor = hsv2rgb(vec3(hue, s, 1.0));

    return mix(color, noiseColor, mask * i);
}


/* ---------- MAIN ---------- */

void main()
{
    vec4 tex = texture(uTexture, vTextureCoord);
    vec3 color = tex.rgb;

    // 0 — Procedural noise (before adjustments)
    color = applyNoise(color, vTextureCoord, uNoiseCoverage, uNoiseIntensity, uNoiseSaturation);

    // 1 — Levels
    color = applyLevels(color, uBlacks, uWhites);

    // 2 — Contrast
    color = applyContrast(color, uContrast);

    // 3 — Saturation
    color = applySaturation(color, uSaturation);

    // 4 — Hue
    color = applyHue(color, uHue);

    // 5 — Gamma (last!)
    color = applyGamma(color, uGamma);

    finalColor = vec4(color, tex.a);
}