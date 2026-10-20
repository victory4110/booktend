import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const saltBytes = 16;
const keyBytes = 64;
const cost = 16384;
const blockSize = 8;
const parallelization = 5;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyBytes, { N: cost, r: blockSize, p: parallelization, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key as Buffer)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltBytes);
  const key = await derive(password, salt);
  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, costValue, blockValue, parallelValue, saltValue, keyValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || costValue !== String(cost) || blockValue !== String(blockSize) || parallelValue !== String(parallelization) || !saltValue || !keyValue) return false;
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(keyValue, 'base64url');
  if (salt.length !== saltBytes || expected.length !== keyBytes) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
