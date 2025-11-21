export class Card {
  id: number;
  type: 'income' | 'expense' | 'event' | 'investment';
  title: string;
  description: string;
  amount: number;
  effect?: any;
}
