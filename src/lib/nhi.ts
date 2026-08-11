/**
 * 二代健保補充保費（股利所得）。
 *
 * 規則（2021-01-01 起）：單次給付金額達 20,000 元才扣，費率 2.11%，
 * 單次給付超過 1,000 萬元的部分不計。給付單位就源扣繳，所以實際入帳的是扣完的金額。
 *
 * 股票股利要以**面額**（10 元／股）折算成金額，跟同一次的現金股利合併後
 * 才拿去比門檻——這也是為什麼配股不多但現金股利接近門檻時會突然被扣到。
 * 費率或門檻調整時只要改這三個常數。
 */
export const NHI_RATE = 0.0211;
export const NHI_MIN_PAYMENT = 20_000;
export const NHI_MAX_PAYMENT = 10_000_000;

/**
 * 單次給付金額對應的補充保費（元，四捨五入到整數）。
 * @param payment 現金股利 ＋ 股票股利面額
 */
export function nhiPremium(payment: number): number {
  if (!(payment >= NHI_MIN_PAYMENT)) return 0;
  return Math.round(Math.min(payment, NHI_MAX_PAYMENT) * NHI_RATE);
}
