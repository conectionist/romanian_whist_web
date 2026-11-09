// CSS's cubic-bezier(x1, y1, x2, y2): a segment from (0, 0) to (1, 1) whose control points are
// (x1, y1) and (x2, y2). The easing of progress in time, solved for the curve's own parameter.
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (progress: number) => number {
  const sample = (a: number, b: number, c: number, t: number) => ((a * t + b) * t + c) * t;
  const coefficients = (first: number, second: number) => ({
    c: 3 * first,
    b: 3 * (second - first) - 3 * first,
    a: 1 - 3 * first - (3 * (second - first) - 3 * first),
  });
  const x = coefficients(x1, x2);
  const y = coefficients(y1, y2);

  return (progress: number): number => {
    if (progress <= 0) {
      return 0;
    }
    if (progress >= 1) {
      return 1;
    }
    // Bisection: the curve's x is monotonic for the control points the table uses.
    let low = 0;
    let high = 1;
    let t = progress;
    for (let step = 0; step < 40; step++) {
      const at = sample(x.a, x.b, x.c, t);
      if (Math.abs(at - progress) < 1e-9) {
        break;
      }
      if (at < progress) {
        low = t;
      } else {
        high = t;
      }
      t = (low + high) / 2;
    }
    return sample(y.a, y.b, y.c, t);
  };
}

// CSS's ease-out: cubic-bezier(0, 0, 0.58, 1).
export const easeOut = cubicBezier(0, 0, 0.58, 1);
