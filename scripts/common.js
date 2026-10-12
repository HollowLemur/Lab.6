import fs from 'node:fs';
import { Contract, JsonRpcProvider, Wallet, parseUnits } from 'ethers';

export const FEED_ADDRESS = process.env.ETH_USD_FEED || '0x694AA1769357215DE4FAC081bf1f309aDC325306';
export const feedAbi = [
  'function decimals() view returns(uint8)',
  'function description() view returns(string)',
  'function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)'
];
export const engineAbi = () => JSON.parse(fs.readFileSync('artifacts/StableEngine.json', 'utf8')).abi;
export const tokenArtifact = () => JSON.parse(fs.readFileSync('artifacts/StableCoin.json', 'utf8'));
export const engineArtifact = () => JSON.parse(fs.readFileSync('artifacts/StableEngine.json', 'utf8'));
export function config() {
  if (!process.env.SEPOLIA_RPC_URL || !/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || '')) {
    throw Error('Set SEPOLIA_RPC_URL and PRIVATE_KEY in local .env');
  }
  const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL, 11155111, { cacheTimeout: -1 });
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  return { provider, wallet };
}
export async function assertSepolia(provider) {
  const net = await provider.getNetwork();
  if (net.chainId !== 11155111n) throw Error(`Wrong chainId: ${net.chainId}. Select Ethereum Sepolia.`);
}
export async function send(promise, label) {
  const tx = await promise;
  console.log(`${label} sent: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw Error(`${label} reverted in block ${receipt.blockNumber}`);
  console.log(`${label} confirmed in block ${receipt.blockNumber} (gas ${receipt.gasUsed})`);
  return receipt;
}
export function updateEnv(updates) {
  const file = '.env';
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(content)) content = content.replace(pattern, `${key}=${value}`);
    else content += `${content.endsWith('\n') || !content ? '' : '\n'}${key}=${value}\n`;
  }
  fs.writeFileSync(file, content);
}
export function targetHealthFactor() {
  const value = process.env.TARGET_HEALTH_FACTOR || '1.10';
  if (Number(value) < 1.05 || Number(value) > 1.25) throw Error('TARGET_HEALTH_FACTOR must be between 1.05 and 1.25');
  return parseUnits(value, 18);
}
export function logLine(text) {
  fs.mkdirSync('results', { recursive: true });
  fs.appendFileSync('results/bot.log', `${new Date().toISOString()} ${text}\n`);
}
export function saveResult(file, value) {
  fs.mkdirSync('results', { recursive: true });
  fs.writeFileSync(`results/${file}.json`, JSON.stringify(value, null, 2));
}
