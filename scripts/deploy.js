import assert from 'node:assert/strict';
import { ContractFactory, formatEther, parseEther } from 'ethers';
import { config, assertSepolia, FEED_ADDRESS, engineArtifact, tokenArtifact, send, updateEnv, saveResult } from './common.js';

const { provider, wallet } = config();
try {
  await assertSepolia(provider);
  const balance = await provider.getBalance(wallet.address);
  assert.ok(balance >= parseEther('0.02'), 'Fund this Sepolia wallet with at least 0.02 Sepolia ETH before deployment');
  const surname = process.env.STUDENT_SURNAME || 'Student';
  const safeSymbol = surname.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  assert.ok(safeSymbol.length >= 2, 'Set STUDENT_SURNAME in .env using Latin letters');
  const token = await new ContractFactory(tokenArtifact().abi, tokenArtifact().bytecode, wallet)
    .deploy(`${surname}USD`, `${safeSymbol}USD`);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`StableCoin: ${tokenAddress}`);
  const tokenReceipt = await send(token.deploymentTransaction(), 'StableCoin deployment');

  const bonus = Number(process.env.LIQUIDATION_BONUS_PERCENT || '10');
  const engine = await new ContractFactory(engineArtifact().abi, engineArtifact().bytecode, wallet)
    .deploy(tokenAddress, FEED_ADDRESS, bonus);
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log(`StableEngine: ${engineAddress}`);
  const engineReceipt = await send(engine.deploymentTransaction(), 'StableEngine deployment');
  const ownershipReceipt = await send(token.transferOwnership(engineAddress), 'transferOwnership');
  assert.equal((await token.owner()).toLowerCase(), engineAddress.toLowerCase());
  updateEnv({ ENGINE_ADDRESS: engineAddress, BORROWER_ADDRESS: wallet.address });
  saveResult('deployment', {
    network: 'Ethereum Sepolia', chainId: 11155111, deployer: wallet.address,
    stablecoin: tokenAddress, engine: engineAddress, oracle: FEED_ADDRESS,
    stablecoinTx: tokenReceipt.hash, engineTx: engineReceipt.hash, ownershipTx: ownershipReceipt.hash
  });
  console.log(`Token owner is engine: PASS`);
  console.log(`Sepolia ETH remaining: ${formatEther(await provider.getBalance(wallet.address))}`);
  console.log('Saved ENGINE_ADDRESS and BORROWER_ADDRESS into local .env');
} finally { provider.destroy(); }
