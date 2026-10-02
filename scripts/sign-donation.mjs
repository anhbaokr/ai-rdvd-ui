import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const inputPath = path.join(root, 'src-tauri', 'donation', 'donation-input.json');
const manifestPath = path.join(root, 'src-tauri', 'donation', 'donation.manifest.json');
const secretDir = path.join(root, '.secrets');
const privateKeyPath = path.join(secretDir, 'donation-private.pem');
const donationRsPath = path.join(root, 'src-tauri', 'src', 'donation.rs');

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing ${inputPath}. Copy donation-input.example.json to donation-input.json and fill the real data.`);
}

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const required = ['author', 'bankName', 'bankBin', 'accountNumber', 'accountName', 'addInfo'];
for (const key of required) {
  if (typeof input[key] !== 'string' || !input[key].trim()) {
    throw new Error(`Missing donation field: ${key}`);
  }
}

fs.mkdirSync(secretDir, { recursive: true });

let privateKey;
let publicKey;
if (fs.existsSync(privateKeyPath)) {
  privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath));
  publicKey = crypto.createPublicKey(privateKey);
} else {
  ({ privateKey, publicKey } = crypto.generateKeyPairSync('ed25519'));
  fs.writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
}

const publicDer = publicKey.export({ type: 'spki', format: 'der' });
const publicKeyB64 = publicDer.toString('base64');

// The application pins the raw 32-byte Ed25519 key, not the DER wrapper.
const rawPublicKeyB64 = publicDer.subarray(publicDer.length - 32).toString('base64');

const canonical = [
  'AI-RDVD-DONATION-V1',
  `author=${input.author.trim()}`,
  `bank_name=${input.bankName.trim()}`,
  `bank_bin=${input.bankBin.trim()}`,
  `account_number=${input.accountNumber.trim()}`,
  `account_name=${input.accountName.trim()}`,
  `add_info=${input.addInfo.trim()}`,
  `amount=${input.amount == null ? '' : String(input.amount)}`,
].join('\n');

const payloadHash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
const signatureB64 = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');

const manifest = {
  enabled: true,
  schema: 1,
  author: input.author.trim(),
  bankName: input.bankName.trim(),
  bankBin: input.bankBin.trim(),
  accountNumber: input.accountNumber.trim(),
  accountName: input.accountName.trim(),
  addInfo: input.addInfo.trim(),
  amount: input.amount == null ? null : Number(input.amount),
  payloadHash,
  signature: signatureB64,
  publicKey: publicKeyB64,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

let rs = fs.readFileSync(donationRsPath, 'utf8');
rs = rs.replace(
  /const PINNED_PUBLIC_KEY_B64: &str = ".*?";/,
  `const PINNED_PUBLIC_KEY_B64: &str = "${rawPublicKeyB64}";`,
);
fs.writeFileSync(donationRsPath, rs, 'utf8');

console.log('Donation manifest signed.');
console.log(`Public key: ${rawPublicKeyB64}`);
console.log(`Private key: ${privateKeyPath}`);
console.log('KEEP THE PRIVATE KEY OUT OF GIT/GITHUB.');
