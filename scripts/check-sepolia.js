import assert from 'node:assert/strict';
import { Contract } from 'ethers';
import { config, assertSepolia, FEED_ADDRESS, feedAbi } from './common.js';

const { provider, wallet } = config();
try {
  await assertSepolia(provider);
  const code = await provider.getCode(FEED_ADDRESS);
  assert.notEqual(code, '0x', 'No Chainlink feed bytecode at this address');
  const feed = new Contract(FEED_ADDRESS, feedAbi, provider);
  const [description, decimals, round, balance] = await Promise.all([
    feed.description(), feed.decimals(), feed.latestRoundData(), provider.getBalance(wallet.address)
  ]);
  const age = Math.floor(Date.now() / 1000) - Number(round[3]);
  assert.ok(description.toLowerCase().includes('eth') && description.toLowerCase().includes('usd'), `Wrong feed: ${description}`);
  assert.ok(round[1] > 0n && age >= 0 && age < 172800, 'Feed answer is invalid or stale');
  console.log('Chain: Ethereum Sepolia');
  console.log('chainId: 11155111');
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Sepolia ETH balance: ${balance}`);
  console.log(`Chainlink feed: ${description} (${FEED_ADDRESS})`);
  console.log(`Price: ${(Number(round[1]) / 10 ** Number(decimals)).toFixed(2)} USD`);
  console.log(`Feed answer age: ${age}s`);
  console.log('RPC and oracle checks: PASS');
} finally { provider.destroy(); }
