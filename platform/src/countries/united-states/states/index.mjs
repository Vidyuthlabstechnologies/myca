import { STATE as AL } from './al.mjs';
import { STATE as AR } from './ar.mjs';
import { STATE as AZ } from './az.mjs';
import { STATE as CA } from './ca.mjs';
import { STATE as CO } from './co.mjs';
import { STATE as CT } from './ct.mjs';
import { STATE as DC } from './dc.mjs';
import { STATE as DE } from './de.mjs';
import { STATE as GA } from './ga.mjs';
import { STATE as HI } from './hi.mjs';
import { STATE as IA } from './ia.mjs';
import { STATE as ID } from './id.mjs';
import { STATE as IL } from './il.mjs';
import { STATE as IN } from './in.mjs';
import { STATE as KS } from './ks.mjs';
import { STATE as KY } from './ky.mjs';
import { STATE as LA } from './la.mjs';
import { STATE as MA } from './ma.mjs';
import { STATE as MD } from './md.mjs';
import { STATE as ME } from './me.mjs';
import { STATE as MI } from './mi.mjs';
import { STATE as MN } from './mn.mjs';
import { STATE as MO } from './mo.mjs';
import { STATE as MS } from './ms.mjs';
import { STATE as MT } from './mt.mjs';
import { STATE as NC } from './nc.mjs';
import { STATE as ND } from './nd.mjs';
import { STATE as NE } from './ne.mjs';
import { STATE as NJ } from './nj.mjs';
import { STATE as NM } from './nm.mjs';
import { STATE as NY } from './ny.mjs';
import { STATE as OH } from './oh.mjs';
import { STATE as OK } from './ok.mjs';
import { STATE as OR } from './or.mjs';
import { STATE as PA } from './pa.mjs';
import { STATE as RI } from './ri.mjs';
import { STATE as SC } from './sc.mjs';
import { STATE as UT } from './ut.mjs';
import { STATE as VA } from './va.mjs';
import { STATE as VT } from './vt.mjs';
import { STATE as WI } from './wi.mjs';
import { STATE as WV } from './wv.mjs';

export const STATE_MODULES = Object.freeze([
  AL,
  AR,
  AZ,
  CA,
  CO,
  CT,
  DC,
  DE,
  GA,
  HI,
  IA,
  ID,
  IL,
  IN,
  KS,
  KY,
  LA,
  MA,
  MD,
  ME,
  MI,
  MN,
  MO,
  MS,
  MT,
  NC,
  ND,
  NE,
  NJ,
  NM,
  NY,
  OH,
  OK,
  OR,
  PA,
  RI,
  SC,
  UT,
  VA,
  VT,
  WI,
  WV,
]);

export function stateModule(code) {
  return STATE_MODULES.find((entry) => entry.code === String(code || '').toUpperCase()) || null;
}
