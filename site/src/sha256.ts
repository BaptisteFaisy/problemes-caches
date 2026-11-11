/**
 * SHA-256 pur TypeScript — remplaçant de `node:crypto` pour le site de
 * démonstration.
 *
 * Le domaine (`src/core/`) empreinte ses identifiants avec
 * `createHash('sha256').update(texte, 'utf8').digest('hex')`. Dans un
 * navigateur, `node:crypto` n'existe pas et `crypto.subtle` est **asynchrone**,
 * donc inutilisable à la place d'un appel synchrone. Ce module fournit la même
 * API, de façon synchrone, et `sha256.test.ts` vérifie qu'il produit **les
 * mêmes empreintes que Node** : un identifiant de grappe calculé dans le
 * navigateur est donc identique à celui calculé par l'app dans Jira.
 *
 * Spécification : FIPS 180-4.
 */

/** Constantes K de SHA-256 (premiers 32 bits des parties fractionnaires des
 * racines cubiques des 64 premiers nombres premiers). */
const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** État initial H (premiers 32 bits des parties fractionnaires des racines
 * carrées des 8 premiers nombres premiers). */
const H0: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/** Rotation circulaire droite sur 32 bits. */
function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Message rembourré selon FIPS 180-4 : un octet `0x80`, des zéros, puis la
 * longueur en bits sur 64 bits (grands bouts). La taille finale est un multiple
 * de 64 octets.
 */
function pad(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const withMarker = message.length + 1;
  const padding = (56 - (withMarker % 64) + 64) % 64;
  const total = withMarker + padding + 8;
  const out = new Uint8Array(total);
  out.set(message);
  out[message.length] = 0x80;
  const view = new DataView(out.buffer);
  view.setUint32(total - 8, Math.floor(bitLength / 2 ** 32), false);
  view.setUint32(total - 4, bitLength >>> 0, false);
  return out;
}

/** Tour de compression sur un bloc de 512 bits : l'état est modifié sur place. */
function compress(state: Uint32Array, block: DataView, offset: number): void {
  const w = new Uint32Array(64);
  for (let i = 0; i < 16; i += 1) w[i] = block.getUint32(offset + i * 4, false);
  for (let i = 16; i < 64; i += 1) {
    const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
    const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
    w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
  }
  let [a, b, c, d, e, f, g, h] = state as unknown as number[];
  for (let i = 0; i < 64; i += 1) {
    const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25);
    const choose = (e! & f!) ^ (~e! & g!);
    const temp1 = (h! + S1 + choose + K[i]! + w[i]!) >>> 0;
    const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22);
    const major = (a! & b!) ^ (a! & c!) ^ (b! & c!);
    const temp2 = (S0 + major) >>> 0;
    h = g; g = f; f = e;
    e = (d! + temp1) >>> 0;
    d = c; c = b; b = a;
    a = (temp1 + temp2) >>> 0;
  }
  state[0] = (state[0]! + a!) >>> 0;
  state[1] = (state[1]! + b!) >>> 0;
  state[2] = (state[2]! + c!) >>> 0;
  state[3] = (state[3]! + d!) >>> 0;
  state[4] = (state[4]! + e!) >>> 0;
  state[5] = (state[5]! + f!) >>> 0;
  state[6] = (state[6]! + g!) >>> 0;
  state[7] = (state[7]! + h!) >>> 0;
}

/** Empreinte SHA-256 d'un texte, en hexadécimal minuscule (comme Node). */
export function sha256Hex(text: string): string {
  const padded = pad(new TextEncoder().encode(text));
  const state = Uint32Array.from(H0);
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padded.length; offset += 64) {
    compress(state, view, offset);
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, '0')).join('');
}

/** Accumulateur compatible avec l'API `createHash` de `node:crypto`. */
export interface HashLike {
  update(data: string, encoding?: string): HashLike;
  digest(encoding: 'hex'): string;
}

/**
 * Substitut synchrone de `createHash('sha256')` : seul le couple
 * `update(texte, 'utf8').digest('hex')` utilisé par le domaine est supporté.
 * Tout autre algorithme est refusé explicitement plutôt que deviné.
 */
export function createHash(algorithm: string): HashLike {
  if (algorithm.toLowerCase() !== 'sha256') {
    throw new Error(`sha256.ts ne sait pas calculer « ${algorithm} »`);
  }
  let buffer = '';
  return {
    update(data: string): HashLike {
      buffer += data;
      return this;
    },
    digest(): string {
      return sha256Hex(buffer);
    },
  };
}
