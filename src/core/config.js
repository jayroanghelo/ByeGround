export const MAX_IMAGE_DIMENSION = 4096;
export const UNIFORM_BACKGROUND_THRESHOLD = 42;
export const MAX_UNDO_STEPS = 40;

export const DEFAULT_PARAMETERS = Object.freeze({
  matte: "uniform",
  mode: "flood",
  tolerance: 50,
  softness: 40,
  sharpness: 25,
  contraction: 1,
  feather: 1,
  despeckle: true,
  spill: true,
  spillAmount: 95,
});

export const PRESETS = Object.freeze({
  crisp: Object.freeze({
    tolerance: 50,
    softness: 40,
    sharpness: 25,
    contraction: 1,
    feather: 1,
    spill: true,
    spillAmount: 95,
    despeckle: true,
  }),
  soft: Object.freeze({
    tolerance: 70,
    softness: 80,
    sharpness: 10,
    contraction: 1,
    feather: 2,
    spill: true,
    spillAmount: 95,
    despeckle: true,
  }),
});
