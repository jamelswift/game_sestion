export class Asset {
  id: number;
  name: string;
  value: number;
  passiveIncome: number;
  type: 'stock' | 'property' | 'business' | 'other';
}
