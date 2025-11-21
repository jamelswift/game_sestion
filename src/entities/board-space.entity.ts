export class BoardSpace {
  id: number;
  position: number;
  type: 'start' | 'salary' | 'event' | 'asset' | 'debt' | 'goal';
  description?: string;
  amount?: number; // ใช้ได้กับ reward, fine, tax ฯลฯ
}
