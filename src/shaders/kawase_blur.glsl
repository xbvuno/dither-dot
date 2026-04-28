in vec2 vTextureCoord;

uniform sampler2D uTexture;

uniform vec2 uTexelSize;
uniform float uOffset;
uniform float uEdgeStrength;

out vec4 finalColor;

/* ---------- Helpers ---------- */

float edgeWeight(vec3 a, vec3 b, float strength)
{
    float diff = length(a - b);
    return exp(-diff * strength);
}

/* ---------- MAIN ---------- */

void main()
{
    vec3 center = texture(uTexture, vTextureCoord).rgb;

    vec2 off = uTexelSize * uOffset;

    vec3 c1 = texture(uTexture, vTextureCoord + vec2( off.x,  off.y)).rgb;
    vec3 c2 = texture(uTexture, vTextureCoord + vec2(-off.x,  off.y)).rgb;
    vec3 c3 = texture(uTexture, vTextureCoord + vec2( off.x, -off.y)).rgb;
    vec3 c4 = texture(uTexture, vTextureCoord + vec2(-off.x, -off.y)).rgb;

    float w1 = edgeWeight(center, c1, uEdgeStrength);
    float w2 = edgeWeight(center, c2, uEdgeStrength);
    float w3 = edgeWeight(center, c3, uEdgeStrength);
    float w4 = edgeWeight(center, c4, uEdgeStrength);

    vec3 sum =
        center +
        c1 * w1 +
        c2 * w2 +
        c3 * w3 +
        c4 * w4;

    float total = 1.0 + w1 + w2 + w3 + w4;

    finalColor = vec4(sum / total, 1.0);
}
