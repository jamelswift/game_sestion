export interface BoardPosition {
  position: number;
  spaceType: 'start' | 'payday' | 'opportunity' | 'market' | 'doodad' | 'charity' | 'child' | 'downsize';
  name: string;
  description: string;
}

export interface MovementAction {
  playerId: number;
  fromPosition: number;
  toPosition: number;
  movementType: 'dice_roll' | 'card_effect' | 'special_move';
  spacesMovedCount: number;
  triggeredSpaces: BoardPosition[];
  movementReason?: string;
}

export interface DiceRoll {
  playerId: number;
  dice1: number;
  dice2: number;
  total: number;
  timestamp: Date;
  isDouble: boolean;
}

export interface SpaceAction {
  spaceType: string;
  actionType: 'land_on' | 'pass_through';
  effects: SpaceEffect[];
}

export interface SpaceEffect {
  effectType: 'cash_change' | 'draw_card' | 'pay_expense' | 'collect_income' | 'choice_required';
  value?: number;
  description: string;
  cardType?: string;
}

export interface MovementResult {
  movementAction: MovementAction;
  spaceEffects: SpaceEffect[];
  newPosition: number;
  cashChange: number;
  cardsDrawn: number;
  requiresPlayerChoice: boolean;
  choiceOptions?: any[];
}