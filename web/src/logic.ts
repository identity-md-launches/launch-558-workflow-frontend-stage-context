import { BaseError, ContractFunctionRevertedError, formatUnits, parseUnits } from 'viem';
export function amountOf(text: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d*)?$/.test(text) || (text.split('.')[1]?.length ?? 0) > decimals) return null;
  try { const n = parseUnits(text, decimals); return n > 0n && n < 2n ** 128n ? n : null; } catch { return null; }
}
export function formatAmount(n: bigint | undefined, decimals = 18, precision = 4) {
  if (n === undefined) return '—';
  const raw = formatUnits(n, decimals); const [whole, fraction] = raw.split('.');
  if (n > 0n && Number(raw) < 10 ** -precision) return `<${(10 ** -precision).toFixed(precision)}`;
  return `${BigInt(whole).toLocaleString('en-US')}${fraction ? '.' + fraction.slice(0, precision).replace(/0+$/, '') : ''}`.replace(/\.$/, '');
}
export const dateOf = (n: bigint) => n === 0n ? 'No active period' : new Date(Number(n) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function minOutput(output: bigint, slippage: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(slippage)) throw Error('Use a slippage between 0.1% and 5%, with at most two decimal places.');
  const bps = Math.round(Number(slippage) * 100);
  if (bps < 10 || bps > 500) throw Error('Use a slippage between 0.1% and 5%.');
  return output * BigInt(10000 - bps) / 10000n;
}
export function fundingFloor(s: { minimumFunding: bigint; timestamp: bigint; periodFinish: bigint; lastUpdateTime: bigint; unallocatedRewards: bigint; totalStaked: bigint; rewardRate: bigint; rewardsDuration: bigint }) {
  const active = s.timestamp < s.periodFinish;
  const applicable = active ? s.timestamp : s.periodFinish;
  const parked = s.unallocatedRewards + (s.totalStaked === 0n && applicable > s.lastUpdateTime ? (applicable - s.lastUpdateTime) * s.rewardRate : 0n);
  const remaining = active ? (s.periodFinish - s.timestamp) * s.rewardRate : 0n;
  const needed = (active ? s.rewardsDuration * s.rewardRate : s.rewardsDuration) - parked - remaining;
  return [1n, s.minimumFunding, needed].reduce((a,b) => a>b?a:b);
}
const reasons: Record<string,string> = {
  StillLocked: 'Your principal is still locked. Wait until the displayed unlock time; rewards can still be claimed.',
  InsufficientStake: 'This amount exceeds your stake. Refresh and enter a smaller amount.',
  FundingBelowMinimum: 'Increase your contribution to the displayed funding minimum.',
  RewardRateDecrease: 'This contribution would reduce the active reward rate. Increase it or wait for the period to end.',
  RewardRateZero: 'This contribution is too small to stream rewards. Increase the amount.',
  NothingToClaim: 'There are no rewards to claim. Refresh your position.',
  ERC20InsufficientBalance: 'Your token balance is too low. Refresh and reduce the amount.',
  ERC20InsufficientAllowance: 'Token approval is too low. Refresh and approve the required amount.',
};
export function explain(error: unknown): string {
  const e = error as { code?: number; message?: string; shortMessage?: string; cause?: unknown };
  if (e?.code === 4001 || /rejected|denied/i.test(e?.message ?? '')) return 'Request rejected in your wallet. Nothing else was submitted; you can try again.';
  if (error instanceof BaseError) { const revert = error.walk(x => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError; if (revert?.data?.errorName) return reasons[revert.data.errorName] ?? `The contract rejected this action (${revert.data.errorName}). Refresh and check the amount and pool liquidity.`; }
  if (/insufficient funds/i.test(e?.message ?? '')) return 'Not enough native currency for this transaction and gas. Add funds or reduce the amount.';
  return e?.shortMessage || e?.message || 'Unable to complete this request. Check your connection and try again.';
}
