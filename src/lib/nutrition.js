/** Weight lb, height inches, age years */
export function estimateMifflinBmr(weightLb, heightIn, age, sex) {
  const w = Number(weightLb);
  const h = Number(heightIn);
  const a = Number(age);
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(a) || w <= 0 || h <= 0 || a <= 0) {
    return null;
  }
  const isMale = sex === "male";
  const s = isMale ? 5 : -161;
  return 10 * (w * 0.453592) + 6.25 * (h * 2.54) - 5 * a + s;
}

export function estimateTdee(bmr, activityMultiplier) {
  const m = Number(activityMultiplier);
  if (!Number.isFinite(bmr) || !Number.isFinite(m) || m <= 0) {
    return null;
  }
  return bmr * m;
}
