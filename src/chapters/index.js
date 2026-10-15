// Maps chapter ids (content/chapters.js) to their 3D scene classes.
import { Prologue } from './Prologue.js';
import { Stub } from './Stub.js';
import { Origin } from './Origin.js';
import { History } from './History.js';
import { Tree } from './Tree.js';
import { Numbers } from './Numbers.js';
import { Share } from './Share.js';
import { Mlcc } from './Mlcc.js';
import { Inductor } from './Inductor.js';
import { Hdd } from './Hdd.js';
import { Battery } from './Battery.js';
import { Sensors } from './Sensors.js';
import { Lab } from './Lab.js';

export const REGISTRY = {
  prologue: Prologue,
  origin: Origin,
  history: History,
  tree: Tree,
  numbers: Numbers,
  share: Share,
  mlcc: Mlcc,
  inductor: Inductor,
  hdd: Hdd,
  battery: Battery,
  sensors: Sensors,
  power: Stub,
  ai: Stub,
  future: Stub,
  global: Stub,
  culture: Stub,
  challenges: Stub,
  finale: Stub,
  lab: Lab,
};
