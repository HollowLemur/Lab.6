import assert from 'node:assert/strict';
import { Contract, formatEther, formatUnits } from 'ethers';
import { config, assertSepolia, engineAbi, send, saveResult } from './common.js';

const engineAddress = process.env.ENGINE_ADDRESS;
const borrower = process.env.BORROWER_ADDRESS;
if (!/^0x[0-9a-fA-F]{40}$/.test(engineAddress || '') || !/^0x[0-9a-fA-F]{40}$/.test(borrower || '')) {
  throw Error('Deploy contracts and open the borrower position first');
}
const { provider, wallet } = config();
try {
  await assertSepolia(provider);
  const engine = new Contract(engineAddress, engineAbi(), wallet);
  assert.equal((await engine.labOwner()).toLowerCase(), wallet.address.toLowerCase(), 'This wallet did not deploy the lab Engine');
  const before = await engine.getHealthFactor(borrower);
  const collateral = await engine.collateralDeposited(borrower);
  assert.ok(before >= 10n ** 18n && collateral > 0n, 'Borrower must have a healthy, collateralized position first');
  const loss = collateral / 4n;
  console.log(`Borrower: ${borrower}; current HF: ${formatUnits(before,18)}`);
  console.log(`Applying lab-only collateral register reduction: ${formatEther(loss)} ETH`);
  console.log('This test backdoor changes accounting only; it does not transfer ETH.');
  const receipt = await send(engine.simulateCollateralLoss(borrower, loss), 'simulateCollateralLoss (lab backdoor)');
  const after = await engine.getHealthFactor(borrower);
  console.log(`Health Factor after simulated loss: ${formatUnits(after,18)}`);
  assert.ok(after < 10n ** 18n, 'Simulation did not make the position liquidatable');
  console.log('Liquidator trigger condition HF < 1: PASS');
  saveResult('simulation', { borrower, lossWei: loss.toString(), healthFactorBefore: formatUnits(before,18), healthFactorAfter: formatUnits(after,18), tx: receipt.hash, block: receipt.blockNumber });
} finally { provider.destroy(); }
