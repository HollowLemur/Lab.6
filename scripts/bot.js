import { Contract, formatUnits } from 'ethers';
import { config, assertSepolia, engineAbi, logLine, send, saveResult } from './common.js';

const engineAddress = process.env.ENGINE_ADDRESS;
const borrower = process.env.BORROWER_ADDRESS;
if (!/^0x[0-9a-fA-F]{40}$/.test(engineAddress || '') || !/^0x[0-9a-fA-F]{40}$/.test(borrower || '')) {
  throw Error('Deploy the contracts and set ENGINE_ADDRESS/BORROWER_ADDRESS in .env first');
}
const { provider, wallet } = config();
const interval = Math.max(5000, Number(process.env.BOT_INTERVAL_MS || 12000));
try {
  await assertSepolia(provider);
  const engine = new Contract(engineAddress, engineAbi(), wallet);
  const tokenAddress = await engine.stablecoin();
  const token = new Contract(tokenAddress, ['function balanceOf(address) view returns(uint256)', 'function symbol() view returns(string)'], provider);
  console.log(`Off-chain ліквідатор запущено. Engine: ${engineAddress}`);
  console.log(`Боржник: ${borrower}; ліквідатор: ${wallet.address}`);
  console.log(`Опитування кожні ${interval} ms. Натисни Ctrl+C після завершення.`);
  logLine(`BOT_START engine=${engineAddress} borrower=${borrower} liquidator=${wallet.address}`);
  while (true) {
    try {
      const [hf, due, liquidatorBalance, symbol] = await Promise.all([
        engine.getHealthFactor(borrower), engine.debt(borrower), token.balanceOf(wallet.address), token.symbol()
      ]);
      const line = `MONITOR borrower=${borrower} HF=${formatUnits(hf,18)} debt=${formatUnits(due,18)} ${symbol}`;
      console.log(line);
      logLine(line);
      if (due > 0n && hf < 10n ** 18n) {
        if (liquidatorBalance < due) throw Error(`Bot wallet balance ${formatUnits(liquidatorBalance,18)} ${symbol} is below debt ${formatUnits(due,18)} ${symbol}`);
        console.log('HF < 1: позицію визнано неплатоспроможною. Надсилаю liquidate...');
        const receipt = await send(engine.liquidate(borrower, due), 'liquidate');
        const done = `LIQUIDATED borrower=${borrower} block=${receipt.blockNumber} tx=${receipt.hash}`;
        console.log(done);
        logLine(done);
        saveResult('liquidation', {
          network: 'Ethereum Sepolia', chainId: 11155111, engine: engineAddress,
          borrower, liquidator: wallet.address, debtRepaid: due.toString(),
          transactionHash: receipt.hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), status: receipt.status
        });
        break;
      }
    } catch (error) {
      const message = `SCAN_ERROR ${error.shortMessage || error.message}`;
      console.error(message);
      logLine(message);
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
} finally { provider.destroy(); }
