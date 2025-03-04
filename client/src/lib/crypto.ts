import CryptoJS from 'crypto-js';

const SECRET = import.meta.env.VITE_CRYPTO_SECRET;

export function encryptData(data: string): string {
  return CryptoJS.AES.encrypt(data, SECRET).toString();
}

export function decryptData(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
}