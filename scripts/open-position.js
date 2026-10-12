import assert from 'node:assert/strict';
import { Contract, formatUnits, parseEther } from 'ethers';
import { config, assertSepolia, engineAbi, send, targetHealthFactor, saveResult } from './common.js';

const engineAddress = process.env.ENGINE_ADDRESS;
if (!/^0x[0-9a-fA-F]{40}$/.test(engineAddress || '')) throw Error('Run npm run deploy first so .env contains ENGINE_ADDRESS');
const collateral = parseEther(process.env.COLLATERAL_ETH || '0.01');
const { provider, wallet } = config();
try {
  await assertSepolia(provider);
  const engine = new Contract(engineAddress, engineAbi(), wallet);
  const borrower = wallet.address;
  if ((await engine.debt(borrower)) !== 0n || (await engine.collateralDeposited(borrower)) !== 0n) {
    throw Error('This address already has a position. Use a new test wallet or complete the existing liquidation first.');
  }
  const feedAddress = await engine.priceFeed();
  const feed = new Contract(feedAddress, ['function decimals() view returns(uint8)', 'function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)'], provider);
  const [decimals, round] = await Promise.all([feed.decimals(), feed.latestRoundData()]);
  const price = round[1] * 10n ** (18n - BigInt(decimals));
  const collateralUsd = collateral * price / 10n ** 18n;
  const targetHF = targetHealthFactor();
  const debt = collateralUsd * 100n * 10n ** 18n / (150n * targetHF);
  assert.ok(debt > 0n, 'Calculated debt rounded to zero');
  console.log(`Borrower: ${borrower}`);
  console.log(`Deposit: ${formatUnits(collateral, 18)} ETH`);
  console.log(`Oracle price: $${formatUnits(price, 18)} / ETH`);
  const depositReceipt = await send(engine.depositCollateral({ value: collateral }), 'depositCollateral');
  const mintReceipt = await send(engine.mintStablecoin(debt), 'mintStablecoin');
  const hf = await engine.getHealthFactor(borrower);
  console.log(`Debt issued: ${formatUnits(debt, 18)} ${await (new Contract(await engine.stablecoin(), ['function symbol() view returns(string)'], provider)).symbol()}`);
  console.log(`Health Factor: ${formatUnits(hf, 18)}`);
  console.log(`Debt position near target ${formatUnits(targetHF, 18)}: ${hf >= targetHF ? 'PASS' : 'BELOW TARGET; recheck oracle price movement'}`);
  assert.ok(hf >= 10n ** 18n, 'Debt would be unsafe at current price');
  saveResult('position', {
    network: 'Ethereum Sepolia', chainId: 11155111, borrower,
    collateralWei: collateral.toString(), collateralEth: formatUnits(collateral, 18),
    oraclePriceUsd: formatUnits(price, 18), debtWei: debt.toString(), debt: formatUnits(debt, 18),
    healthFactor: formatUnits(hf, 18), depositTx: depositReceipt.hash, mintTx: mintReceipt.hash
  });
} finally { provider.destroy(); }
