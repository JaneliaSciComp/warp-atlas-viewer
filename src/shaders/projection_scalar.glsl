// Shared scalar mapping for all scalar-projection shaders.
//
// Uniform contract is supplied by BrainViewer's projection materials:
//   scalarMode = 0 sequential linear, 1 sequential log1p, 2 signed/diverging.
//   scalarLo / scalarHi are display anchors; signed mode treats scalarLo
//   as the deadband magnitude and scalarHi as the endpoint magnitude.
//   scalarHiNeg is the negative-side endpoint magnitude in signed mode
//   (equals scalarHi unless split saturation is enabled); sequential
//   modes ignore it.

uniform int scalarMode;
uniform float scalarLo;
uniform float scalarHi;
uniform float scalarHiNeg;
uniform float scalarLogDen;

float scalarToT(float x) {
  if (scalarMode == 2) {
    float hi = max(scalarLo + 0.000001, x < 0.0 ? scalarHiNeg : scalarHi);
    float mag = abs(x);
    float v = mag <= scalarLo ? 0.0 : clamp((mag - scalarLo) / (hi - scalarLo), 0.0, 1.0);
    float signedV = x < 0.0 ? -v : v;
    return signedV * 0.5 + 0.5;
  }
  if (scalarMode == 1) {
    return clamp(log(1.0 + max(0.0, x)) / max(0.000001, scalarLogDen), 0.0, 1.0);
  }
  return clamp((x - scalarLo) / max(0.000001, scalarHi - scalarLo), 0.0, 1.0);
}
