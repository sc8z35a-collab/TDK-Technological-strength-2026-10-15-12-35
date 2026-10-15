// Maps chapter ids (content/chapters.js) to their 3D scene classes.
import { Prologue } from './Prologue.js';
import { Stub } from './Stub.js';
import { Origin } from './Origin.js';
import { Lab } from './Lab.js';

export const REGISTRY = {
  prologue: Prologue,
  origin: Origin,
  history: Stub,
  tree: Stub,
  numbers: Stub,
  share: Stub,
  mlcc: Stub,
  inductor: Stub,
  hdd: Stub,
  battery: Stub,
  sensors: Stub,
  power: Stub,
  ai: Stub,
  future: Stub,
  global: Stub,
  culture: Stub,
  challenges: Stub,
  finale: Stub,
  lab: Lab,
};
